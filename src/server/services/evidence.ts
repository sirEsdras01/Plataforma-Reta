import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateEvidence, generatePortfolio } from "@/server/ai/agents";
import { PROMPTS } from "@/server/ai/prompts";
import { createAdminClient } from "@/lib/supabase/server";
import { getGitHub } from "@/server/integrations/registry";
import { parseGitHubRepoUrl } from "@/server/integrations/providers/github";
import { safePublicUrl } from "@/server/integrations/http";
import { decideOutcome, weightedScore } from "@/server/ai/agents/validators";
import type { RubricCriterion, StudentContext } from "@/domain/schemas";
import { slugify } from "@/domain/progress";
import { DomainError, recomputeProjectProgress } from "./challenges";
import { logProgress } from "./session";

const TEXT_EXTENSIONS = /\.(md|txt|py|ipynb|js|ts|tsx|jsx|java|c|cpp|h|hpp|m|r|jl|rs|go|json|csv|yaml|yml|toml|tex|sql|sh|ino)$/i;
const MAX_TEXT_BYTES = 300_000;

export interface EvidenceInput {
  body?: string;
  url?: string;
  file?: File | null;
}

/**
 * Recibe una evidencia, la inspecciona de verdad cuando es posible y la evalúa con la rúbrica.
 * - Texto: se analiza directamente.
 * - URL de GitHub: se leen README y árbol de archivos vía API oficial.
 * - Otras URLs: NO se descargan (evita SSRF); quedan como "recibidas, no inspeccionadas".
 * - Archivos de texto/código: se leen (≤300 KB). Binarios (PDF, video, CAD): se almacenan sin inspeccionar.
 * No se ejecuta código del estudiante en el servidor.
 */
export async function submitAndEvaluate(
  supabase: SupabaseClient,
  userId: string,
  student: StudentContext,
  moduleId: string,
  input: EvidenceInput,
) {
  const { data: mod } = await supabase
    .from("challenge_modules")
    .select("id, title, main_deliverable, acceptance_criteria, status, project_id, student_projects(title)")
    .eq("id", moduleId)
    .maybeSingle();
  if (!mod) throw new DomainError("Módulo no encontrado.");
  if (mod.status === "completed") throw new DomainError("Este módulo ya está completado.");

  const { data: rubric } = await supabase
    .from("evaluation_rubrics")
    .select("id, criteria, passing_score")
    .eq("module_id", moduleId)
    .maybeSingle();
  if (!rubric) throw new DomainError("El módulo no tiene rúbrica.");

  const body = input.body?.trim() || "";
  const url = input.url?.trim() ? safePublicUrl(input.url.trim()) : null;
  if (input.url?.trim() && !url) throw new DomainError("La URL debe ser https.");
  if (!body && !url && !input.file) throw new DomainError("Agrega texto, un enlace o un archivo como evidencia.");

  const notes: string[] = [];
  const parts: string[] = [];
  if (body) {
    parts.push(`## Texto del estudiante\n${body}`);
    notes.push("Texto de la entrega: inspeccionado.");
  }

  if (url) {
    const gh = parseGitHubRepoUrl(url);
    if (gh) {
      try {
        const info = await getGitHub().inspectRepository(gh.owner, gh.repo);
        parts.push(
          `## Repositorio ${gh.owner}/${gh.repo} (rama ${info.defaultBranch})\nDescripción: ${info.description ?? "-"}\n\n### Archivos (${info.files.length})\n${info.files.join("\n")}\n\n### README\n${info.readme?.slice(0, 40_000) ?? "(sin README)"}`,
        );
        notes.push(`Repositorio GitHub: README y árbol de archivos leídos vía API (código NO ejecutado).`);
      } catch (err) {
        console.error("[evidence] github inspect failed", err);
        notes.push("Repositorio GitHub: no se pudo leer (privado, inexistente o límite de API). Recibido sin inspeccionar.");
      }
    } else {
      notes.push(`Enlace ${url}: recibido, NO inspeccionado (la plataforma solo inspecciona repositorios GitHub públicos).`);
    }
  }

  // Inserción con service role: el estado de la evidencia lo determina el servidor.
  const admin = createAdminClient();
  let fileRow: { storage_path: string; file_name: string; mime_type: string; size_bytes: number; inspected: boolean } | null = null;
  if (input.file && input.file.size > 0) {
    if (input.file.size > 20 * 1024 * 1024) throw new DomainError("El archivo supera 20 MB.");
    const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
    const path = `${userId}/${moduleId}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from("evidence").upload(path, input.file, {
      contentType: input.file.type || "application/octet-stream",
      upsert: false,
    });
    if (upErr) throw new DomainError("No se pudo subir el archivo.");
    let inspected = false;
    if (TEXT_EXTENSIONS.test(safeName) && input.file.size <= MAX_TEXT_BYTES) {
      const text = await input.file.text();
      parts.push(`## Archivo ${safeName}\n${text}`);
      inspected = true;
      notes.push(`Archivo ${safeName}: contenido leído (no ejecutado).`);
    } else {
      notes.push(`Archivo ${safeName}: almacenado, NO inspeccionado automáticamente (formato binario o demasiado grande).`);
    }
    fileRow = { storage_path: path, file_name: safeName, mime_type: input.file.type, size_bytes: input.file.size, inspected };
  }

  const inspectedContent = parts.join("\n\n");
  const kind = [body, url, fileRow].filter(Boolean).length > 1 ? "mixed" : url ? (parseGitHubRepoUrl(url) ? "repository" : "url") : fileRow ? "file" : "text";
  const { data: sub, error: subErr } = await admin
    .from("submissions")
    .insert({
      module_id: moduleId,
      user_id: userId,
      kind,
      body: body || null,
      url,
      evidence_status: inspectedContent ? "analyzed" : "received",
      inspection_notes: notes,
    })
    .select("id")
    .single();
  if (subErr || !sub) throw new DomainError("No se pudo registrar la evidencia.");
  if (fileRow) await admin.from("submission_files").insert({ ...fileRow, submission_id: sub.id, user_id: userId });

  await supabase.from("challenge_modules").update({ status: "in_review" }).eq("id", moduleId);
  await logProgress(supabase, userId, { type: "submission_created", projectId: mod.project_id as string, moduleId, payload: { kind } });

  const criteria = rubric.criteria as RubricCriterion[];
  const ev = await evaluateEvidence(userId, {
    projectTitle: (mod.student_projects as unknown as { title: string }).title,
    moduleTitle: mod.title as string,
    deliverable: mod.main_deliverable as string,
    acceptanceCriteria: mod.acceptance_criteria as string[],
    rubric: criteria,
    inspectedContent,
    inspectionNotes: notes,
    language: student.preferredLanguage,
  });
  const outcome = decideOutcome(ev, criteria, Number(rubric.passing_score));
  const overall = weightedScore(ev, criteria);

  const { data: evalRow, error: evErr } = await admin
    .from("evaluations")
    .insert({
      submission_id: sub.id,
      rubric_id: rubric.id,
      user_id: userId,
      evaluator: "ai",
      criterion_scores: ev.criterion_scores,
      overall_score: overall,
      outcome,
      strengths: ev.strengths,
      improvements: ev.improvements,
      summary: ev.summary,
      prompt_version: PROMPTS.evidenceEvaluator.version,
    })
    .select("id")
    .single();
  if (evErr || !evalRow) throw new DomainError("No se pudo guardar la evaluación.");

  await logProgress(supabase, userId, { type: "evaluation_received", projectId: mod.project_id as string, moduleId, payload: { outcome, overall } });

  if (outcome === "accepted") {
    const { error: upErr } = await supabase.from("challenge_modules").update({ status: "completed" }).eq("id", moduleId);
    if (upErr) throw new DomainError("No se pudo completar el módulo.");
    // Competencias demostradas: respaldadas por una evaluación aceptada (no son certificaciones).
    if (ev.demonstrated_competencies.length) {
      await admin.from("user_skills").upsert(
        ev.demonstrated_competencies.slice(0, 10).map((name) => ({
          user_id: userId,
          skill_name: name.slice(0, 200),
          source: "demonstrated",
          evidence_evaluation_id: evalRow.id,
        })),
        { onConflict: "user_id,skill_name,source" },
      );
    }
    await logProgress(supabase, userId, { type: "module_completed", projectId: mod.project_id as string, moduleId });
  } else {
    await supabase.from("challenge_modules").update({ status: "needs_changes" }).eq("id", moduleId);
  }
  await recomputeProjectProgress(supabase, mod.project_id as string);

  return { evaluationId: evalRow.id as string, outcome, overall };
}

/** Cierra el proyecto (si todos los módulos están completos) y genera la página de portafolio. */
export async function completeProjectAndGeneratePortfolio(supabase: SupabaseClient, userId: string, student: StudentContext, projectId: string) {
  const { data: project } = await supabase
    .from("student_projects")
    .select("id, title, status, challenge_versions(content)")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) throw new DomainError("Proyecto no encontrado.");

  if (project.status !== "completed") {
    const { error } = await supabase.from("student_projects").update({ status: "completed", progress_pct: 100 }).eq("id", projectId);
    if (error) throw new DomainError("Aún hay módulos sin completar.");
    await logProgress(supabase, userId, { type: "project_completed", projectId });
  }

  const { data: modules } = await supabase
    .from("challenge_modules")
    .select("position, title, main_deliverable, submissions(body, url, evidence_status, inspection_notes, evaluations(overall_score, outcome, summary, strengths))")
    .eq("project_id", projectId)
    .order("position");

  const dossier = JSON.stringify({ challenge: (project.challenge_versions as unknown as { content: unknown }).content, modules }, null, 1);
  const content = await generatePortfolio(userId, dossier, student.preferredLanguage);

  const { data: existing } = await supabase.from("portfolio_items").select("id").eq("project_id", projectId).maybeSingle();
  if (existing) {
    await supabase.from("portfolio_items").update({ content, generated_content: content }).eq("id", existing.id);
  } else {
    await supabase.from("portfolio_items").insert({
      project_id: projectId,
      user_id: userId,
      slug: slugify(content.title, projectId.slice(0, 8)),
      visibility: "private",
      content,
      generated_content: content,
    });
  }
  await logProgress(supabase, userId, { type: "portfolio_generated", projectId, payload: { prompt: PROMPTS.portfolioGenerator.version } });
}
