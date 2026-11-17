import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { composeKnowledgeCard, gradePractice, planResearch, type CandidateForLLM } from "@/server/ai/agents";
import { PROMPTS } from "@/server/ai/prompts";
import { createAdminClient } from "@/lib/supabase/server";
import { rankCandidates } from "@/server/recommendation/ranking";
import { multiProviderSearch, type ProviderRunReport } from "@/server/recommendation/search";
import type { NormalizedResource } from "@/server/integrations/types";
import type { StudentContext } from "@/domain/schemas";
import { DomainError } from "./challenges";
import { logProgress } from "./session";

export interface StoredKnowledgeCard {
  concept: string;
  why_you_need_it: string;
  estimated_minutes_min: number;
  estimated_minutes_max: number;
  explanation_markdown: string;
  worked_example_markdown: string;
  limitations: string;
  provider_report: ProviderRunReport[];
  prompt_version: string;
  generated_at: string;
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function toCandidate(id: string, r: NormalizedResource): CandidateForLLM {
  return {
    id,
    provider: r.providerId,
    type: r.resourceType,
    title: r.title,
    authorsOrChannel: r.authors.slice(0, 5).join(", ") || r.organization || "desconocido",
    year: r.publishedAt?.slice(0, 4) ?? "desconocido",
    url: r.canonicalUrl,
    openAccess: r.isOpenAccess == null ? "desconocido" : r.isOpenAccess ? "sí" : "no",
    peerReviewed: r.peerReviewed == null ? "no verificado" : r.peerReviewed ? "sí" : "no (preprint/no revisado)",
    durationMinutes: r.durationSeconds ? String(Math.round(r.durationSeconds / 60)) : "",
    description: (r.abstract ?? "").slice(0, 1200),
    verifiedSegments: r.segments
      .filter((s) => s.verification !== "unverified")
      .slice(0, 20)
      .map((s) => (s.startSeconds != null ? `${fmtTime(s.startSeconds)}${s.endSeconds ? `-${fmtTime(s.endSeconds)}` : ""} ${s.label}` : s.label)),
  };
}

/** Guarda recursos normalizados en el catálogo global (service role) y devuelve sus IDs. */
async function upsertResources(resources: NormalizedResource[]): Promise<Map<NormalizedResource, string>> {
  const admin = createAdminClient();
  const out = new Map<NormalizedResource, string>();
  for (const r of resources) {
    const { data, error } = await admin
      .from("external_resources")
      .upsert(
        {
          provider_id: r.providerId,
          external_id: r.externalId,
          canonical_url: r.canonicalUrl,
          title: r.title.slice(0, 1000),
          authors: r.authors,
          organization: r.organization,
          published_at: r.publishedAt,
          resource_type: r.resourceType,
          language: r.language,
          license: r.license,
          is_open_access: r.isOpenAccess,
          peer_reviewed: r.peerReviewed,
          duration_seconds: r.durationSeconds,
          doi: r.doi,
          abstract: r.abstract,
          metadata: r.metadata,
          provenance: r.provenance,
          last_verified_at: r.provenance.fetchedAt,
        },
        { onConflict: "provider_id,external_id" },
      )
      .select("id")
      .single();
    if (error || !data) {
      console.error("[resources] upsert failed", error);
      continue;
    }
    out.set(r, data.id as string);
    if (r.segments.length) {
      await admin.from("resource_segments").delete().eq("resource_id", data.id);
      await admin.from("resource_segments").insert(
        r.segments.slice(0, 60).map((s) => ({
          resource_id: data.id,
          label: s.label.slice(0, 300),
          start_seconds: s.startSeconds,
          end_seconds: s.endSeconds,
          verification: s.verification,
          verification_source: s.verificationSource,
        })),
      );
    }
  }
  return out;
}

/**
 * Motor just-in-time: para un concepto del módulo, planifica búsquedas, consulta
 * proveedores reales, deduplica y rankea, y pide al LLM seleccionar SOLO entre los
 * candidatos recuperados. Persiste tarjeta, recursos y práctica.
 */
export async function studyConcept(
  supabase: SupabaseClient,
  userId: string,
  student: StudentContext,
  moduleConceptId: string,
  opts: { force?: boolean } = {},
) {
  const { data: mc } = await supabase
    .from("module_concepts")
    .select(
      "id, status, why_needed, knowledge_card, module_id, knowledge_concepts(name, slug), challenge_modules(title, technical_objective, project_id, student_projects(title))",
    )
    .eq("id", moduleConceptId)
    .maybeSingle();
  if (!mc) throw new DomainError("Concepto no encontrado.");
  if (mc.knowledge_card && !opts.force) return;

  const concept = mc.knowledge_concepts as unknown as { name: string; slug: string };
  const mod = mc.challenge_modules as unknown as {
    title: string;
    technical_objective: string;
    project_id: string;
    student_projects: { title: string };
  };
  const ctx = {
    conceptName: concept.name,
    whyNeeded: mc.why_needed as string,
    projectTitle: mod.student_projects.title,
    moduleTitle: mod.title,
    moduleObjective: mod.technical_objective,
    student,
  };

  const plan = await planResearch(userId, ctx);
  const { results, report } = await multiProviderSearch(plan.queries, { language: student.preferredLanguage });
  const ranked = rankCandidates(results, {
    conceptTerms: `${concept.name} ${plan.queries.map((q) => q.query).join(" ")}`,
    preferredLanguage: student.preferredLanguage,
  });
  const candidates = ranked.map((s, i) => ({ cid: `c${i + 1}`, scored: s }));
  const card = await composeKnowledgeCard(
    userId,
    ctx,
    candidates.map((c) => toCandidate(c.cid, c.scored.resource)),
  );

  const selected = card.selected_resources
    .map((sel) => ({ sel, cand: candidates.find((c) => c.cid === sel.candidate_id) }))
    .filter((x): x is { sel: (typeof card.selected_resources)[number]; cand: (typeof candidates)[number] } => !!x.cand);
  const idMap = await upsertResources(selected.map((s) => s.cand.scored.resource));

  await supabase.from("concept_resources").delete().eq("module_concept_id", moduleConceptId);
  const rows = selected
    .map((s, i) => {
      const resourceId = idMap.get(s.cand.scored.resource);
      if (!resourceId) return null;
      return {
        module_concept_id: moduleConceptId,
        resource_id: resourceId,
        user_id: userId,
        rank: i + 1,
        score: s.cand.scored.score,
        reason: `${s.sel.reason}\n\nCómo usarlo: ${s.sel.how_to_use}`.slice(0, 4000),
        confidence: s.sel.confidence,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  if (rows.length) await supabase.from("concept_resources").insert(rows);

  await supabase.from("practice_exercises").insert({
    module_concept_id: moduleConceptId,
    user_id: userId,
    prompt: card.practice.prompt,
    expected_output_kind: card.practice.expected_output_kind,
    verification_criteria: card.practice.verification_criteria,
    hints: card.practice.hints,
    prompt_version: PROMPTS.knowledgeCard.version,
  });

  const stored: StoredKnowledgeCard = {
    concept: card.concept,
    why_you_need_it: card.why_you_need_it,
    estimated_minutes_min: card.estimated_minutes_min,
    estimated_minutes_max: card.estimated_minutes_max,
    explanation_markdown: card.explanation_markdown,
    worked_example_markdown: card.worked_example_markdown,
    limitations: card.limitations,
    provider_report: report,
    prompt_version: PROMPTS.knowledgeCard.version,
    generated_at: new Date().toISOString(),
  };
  await supabase
    .from("module_concepts")
    .update({
      knowledge_card: stored,
      knowledge_card_generated_at: stored.generated_at,
      status: mc.status === "pending" ? "studying" : mc.status,
    })
    .eq("id", moduleConceptId);
  await logProgress(supabase, userId, {
    type: "concept_studied",
    projectId: mod.project_id,
    moduleId: mc.module_id as string,
    moduleConceptId,
    payload: { resources: rows.length, providers: report.map((r) => `${r.provider}:${r.status}`) },
  });
}

/** "Ya domino este concepto". Si es fundamental se exige haber intentado la práctica rápida antes (ver UI). */
export async function markConceptKnown(supabase: SupabaseClient, userId: string, moduleConceptId: string) {
  const { data: mc } = await supabase
    .from("module_concepts")
    .select("id, is_fundamental, status, module_id")
    .eq("id", moduleConceptId)
    .maybeSingle();
  if (!mc) throw new DomainError("Concepto no encontrado.");
  if (mc.status === "mastered") return;
  if (mc.is_fundamental) {
    throw new DomainError("Este concepto es fundamental para el proyecto: resuelve la comprobación rápida para omitirlo.");
  }
  await supabase.from("module_concepts").update({ status: "skipped_known" }).eq("id", moduleConceptId);
  await logProgress(supabase, userId, { type: "concept_marked_known", moduleId: mc.module_id as string, moduleConceptId });
}

export async function submitPracticeAttempt(
  supabase: SupabaseClient,
  userId: string,
  student: StudentContext,
  exerciseId: string,
  answer: string,
) {
  const { data: ex } = await supabase
    .from("practice_exercises")
    .select("id, prompt, verification_criteria, module_concept_id, module_concepts(id, module_id, status, knowledge_concepts(name))")
    .eq("id", exerciseId)
    .maybeSingle();
  if (!ex) throw new DomainError("Práctica no encontrada.");
  const mc = ex.module_concepts as unknown as { id: string; module_id: string; status: string; knowledge_concepts: { name: string } };

  const feedback = await gradePractice(userId, {
    concept: mc.knowledge_concepts.name,
    prompt: ex.prompt as string,
    criteria: ex.verification_criteria as string[],
    answer,
    language: student.preferredLanguage,
  });

  // Escritura con service role: el estudiante no puede marcar su propio intento como aprobado.
  const admin = createAdminClient();
  const { error } = await admin.from("practice_attempts").insert({
    exercise_id: exerciseId,
    user_id: userId,
    answer,
    passed: feedback.passed,
    feedback,
  });
  if (error) throw new DomainError("No se pudo guardar el intento.");

  if (feedback.passed) {
    await supabase.from("module_concepts").update({ status: "mastered" }).eq("id", mc.id);
    await logProgress(supabase, userId, { type: "practice_passed", moduleId: mc.module_id, moduleConceptId: mc.id });
  } else {
    if (mc.status === "studying" || mc.status === "pending") {
      await supabase.from("module_concepts").update({ status: "practicing" }).eq("id", mc.id);
    }
    await logProgress(supabase, userId, { type: "practice_attempted", moduleId: mc.module_id, moduleConceptId: mc.id });
  }
  return feedback;
}
