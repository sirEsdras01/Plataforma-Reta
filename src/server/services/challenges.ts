import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { designChallenges, planCurriculum } from "@/server/ai/agents";
import { PROMPTS } from "@/server/ai/prompts";
import { createAdminClient } from "@/lib/supabase/server";
import type { ChallengeProposal, StudentContext } from "@/domain/schemas";
import { progressPct } from "@/domain/progress";
import { logProgress } from "./session";

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

/**
 * Crea un objetivo de aprendizaje y genera propuestas de reto con IA.
 * El objetivo queda persistido aunque la IA falle (estado 'failed' + mensaje),
 * para que el estudiante pueda reintentar sin perder su texto.
 */
export async function createGoalWithProposals(
  supabase: SupabaseClient,
  userId: string,
  student: StudentContext,
  goal: string,
  clarification?: string,
): Promise<string> {
  const { data: goalRow, error } = await supabase
    .from("learning_goals")
    .insert({ user_id: userId, raw_text: goal, status: "open", clarification: clarification ? { answer: clarification } : null })
    .select("id")
    .single();
  if (error || !goalRow) throw new DomainError("No se pudo guardar tu objetivo.");
  await runDesign(supabase, userId, student, goalRow.id as string, goal, clarification);
  return goalRow.id as string;
}

export async function runDesign(
  supabase: SupabaseClient,
  userId: string,
  student: StudentContext,
  goalId: string,
  goal: string,
  clarification?: string,
) {
  try {
    const result = await designChallenges(userId, student, goal, clarification);
    for (const proposal of result.proposals) {
      const { data: ch, error: chErr } = await supabase
        .from("challenges")
        .insert({
          user_id: userId,
          learning_goal_id: goalId,
          title: proposal.title,
          origin: proposal.origin,
          difficulty: proposal.difficulty,
          status: "proposed",
          discipline_slugs: result.intent.discipline_slugs.slice(0, 10),
        })
        .select("id")
        .single();
      if (chErr || !ch) throw new DomainError("No se pudo guardar la propuesta.");
      const { data: ver, error: vErr } = await supabase
        .from("challenge_versions")
        .insert({
          challenge_id: ch.id,
          user_id: userId,
          version: 1,
          content: proposal,
          change_reason: "initial_generation",
          prompt_version: PROMPTS.challengeDesigner.version,
        })
        .select("id")
        .single();
      if (vErr || !ver) throw new DomainError("No se pudo versionar la propuesta.");
      await supabase.from("challenges").update({ current_version_id: ver.id }).eq("id", ch.id);
    }
    await supabase
      .from("learning_goals")
      .update({
        intent: result.intent,
        status: result.intent.clarifying_questions.length > 0 && result.intent.is_too_broad ? "clarifying" : "proposals_ready",
        error_message: null,
      })
      .eq("id", goalId);
    await proposeDisciplines(result.intent.discipline_slugs, result.intent.engineering_areas);
  } catch (err) {
    await supabase
      .from("learning_goals")
      .update({ status: "failed", error_message: err instanceof Error ? err.message.slice(0, 500) : "error" })
      .eq("id", goalId);
    throw err;
  }
}

/** Taxonomía extensible: registra disciplinas nuevas propuestas por la IA (pendientes de curaduría). */
async function proposeDisciplines(slugs: string[], names: string[]) {
  try {
    const rows = slugs
      .filter((s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s))
      .slice(0, 6)
      .map((slug, i) => ({ slug, name: names[i] ?? slug, origin: "ai_proposed" }));
    if (rows.length) await createAdminClient().from("disciplines").upsert(rows, { onConflict: "slug", ignoreDuplicates: true });
  } catch (err) {
    console.error("[taxonomy] propose failed", err);
  }
}

/**
 * Acepta un reto: crea el proyecto del estudiante y genera la ruta modular.
 * Si la planificación falla, el proyecto queda en 'failed' y puede reintentarse.
 */
export async function acceptChallenge(
  supabase: SupabaseClient,
  userId: string,
  student: StudentContext,
  challengeId: string,
): Promise<string> {
  const { data: ch } = await supabase
    .from("challenges")
    .select("id, title, status, current_version_id, challenge_versions!challenge_versions_challenge_id_fkey(id, content, version)")
    .eq("id", challengeId)
    .maybeSingle();
  if (!ch) throw new DomainError("Reto no encontrado.");

  const { data: existing } = await supabase
    .from("student_projects")
    .select("id, status")
    .eq("challenge_id", challengeId)
    .maybeSingle();
  if (existing && existing.status !== "failed") return existing.id as string;

  const versions = (ch.challenge_versions ?? []) as { id: string; content: ChallengeProposal; version: number }[];
  const current = versions.find((v) => v.id === ch.current_version_id) ?? versions.at(-1);
  if (!current) throw new DomainError("El reto no tiene contenido.");

  let projectId = existing?.id as string | undefined;
  if (!projectId) {
    const { data: proj, error } = await supabase
      .from("student_projects")
      .insert({
        user_id: userId,
        challenge_id: challengeId,
        challenge_version_id: current.id,
        title: ch.title,
        status: "planning",
        plan_prompt_version: PROMPTS.curriculumPlanner.version,
      })
      .select("id")
      .single();
    if (error || !proj) throw new DomainError("No se pudo crear el proyecto.");
    projectId = proj.id as string;
    await supabase.from("challenges").update({ status: "accepted" }).eq("id", challengeId);
  } else {
    await supabase.from("student_projects").update({ status: "planning", error_message: null }).eq("id", projectId);
    await supabase.from("challenge_modules").delete().eq("project_id", projectId);
  }

  try {
    const plan = await planCurriculum(userId, student, current.content);
    await persistPlan(supabase, userId, projectId, plan);
    await supabase.from("student_projects").update({ status: "active", progress_pct: 0 }).eq("id", projectId);
    await logProgress(supabase, userId, { type: "project_started", projectId, payload: { modules: plan.modules.length } });
    return projectId;
  } catch (err) {
    await supabase
      .from("student_projects")
      .update({ status: "failed", error_message: err instanceof Error ? err.message.slice(0, 500) : "error" })
      .eq("id", projectId);
    throw err;
  }
}

async function persistPlan(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  plan: Awaited<ReturnType<typeof planCurriculum>>,
) {
  const admin = createAdminClient();
  const idsByPosition = new Map<number, string>();

  for (const [i, m] of plan.modules.entries()) {
    const position = i + 1;
    const { data: row, error } = await supabase
      .from("challenge_modules")
      .insert({
        project_id: projectId,
        user_id: userId,
        position,
        title: m.title,
        technical_objective: m.technical_objective,
        description: m.description,
        competencies: m.competencies,
        prerequisites: m.prerequisites,
        activities: m.activities,
        tools: m.tools,
        main_deliverable: m.main_deliverable,
        acceptance_criteria: m.acceptance_criteria,
        required_evidence: m.required_evidence,
        effort_estimate: m.effort_estimate,
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !row) throw new DomainError(`No se pudo guardar el módulo ${position}.`);
    const moduleId = row.id as string;
    idsByPosition.set(position, moduleId);

    if (m.activities.length) {
      await supabase.from("module_tasks").insert(
        m.activities.slice(0, 20).map((a, k) => ({ module_id: moduleId, user_id: userId, position: k + 1, title: a.slice(0, 500) })),
      );
    }
    await supabase.from("evaluation_rubrics").insert({ module_id: moduleId, user_id: userId, criteria: m.rubric, passing_score: 70 });

    // Conceptos: catálogo global (service role) + vínculo privado al módulo.
    for (const c of m.concepts.slice(0, 10)) {
      const { data: concept, error: cErr } = await admin
        .from("knowledge_concepts")
        .upsert({ slug: c.slug, name: c.name }, { onConflict: "slug" })
        .select("id")
        .single();
      if (cErr || !concept) throw new DomainError("No se pudo registrar un concepto.");
      await supabase.from("module_concepts").upsert(
        {
          module_id: moduleId,
          concept_id: concept.id,
          user_id: userId,
          why_needed: c.why_needed,
          prerequisite_concepts: c.prerequisite_concepts,
          estimated_minutes_min: c.estimated_minutes_min,
          estimated_minutes_max: c.estimated_minutes_max,
          is_fundamental: c.is_fundamental,
        },
        { onConflict: "module_id,concept_id" },
      );
    }
  }

  const deps = plan.modules.flatMap((m, i) =>
    m.depends_on_positions
      .map((d) => ({ module_id: idsByPosition.get(i + 1), depends_on_module_id: idsByPosition.get(d), user_id: userId }))
      .filter((d) => d.module_id && d.depends_on_module_id),
  );
  // Si el plan no declara dependencias, la ruta es secuencial.
  const finalDeps = deps.length
    ? deps
    : [...idsByPosition.entries()]
        .filter(([pos]) => pos > 1)
        .map(([pos, id]) => ({ module_id: id, depends_on_module_id: idsByPosition.get(pos - 1)!, user_id: userId }));
  if (finalDeps.length) await supabase.from("module_dependencies").insert(finalDeps);
}

export async function recomputeProjectProgress(supabase: SupabaseClient, projectId: string) {
  const { data: modules } = await supabase.from("challenge_modules").select("status").eq("project_id", projectId);
  const pct = progressPct((modules ?? []) as { status: never }[]);
  await supabase.from("student_projects").update({ progress_pct: pct }).eq("id", projectId);
  return pct;
}
