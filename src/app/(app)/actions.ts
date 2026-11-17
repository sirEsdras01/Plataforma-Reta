"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { GoalInput, PortfolioContent, ProfileInput } from "@/domain/schemas";
import { AIError, userFacingAIMessage } from "@/server/ai/types";
import { createAdminClient } from "@/lib/supabase/server";
import { acceptChallenge, createGoalWithProposals, DomainError, runDesign } from "@/server/services/challenges";
import { completeProjectAndGeneratePortfolio, submitAndEvaluate } from "@/server/services/evidence";
import { markConceptKnown, studyConcept, submitPracticeAttempt } from "@/server/services/learning";
import { loadStudentContext, logProgress, requireOnboardedUser, requireUser } from "@/server/services/session";

const uuid = z.string().uuid();

function errorMessage(err: unknown): string {
  if (err instanceof AIError) return userFacingAIMessage(err);
  if (err instanceof DomainError) return err.message;
  if (err instanceof Error && err.name === "ConfigPendingError") return err.message;
  console.error("[action] unexpected", err);
  return "Ocurrió un error inesperado. Inténtalo de nuevo.";
}

function withError(path: string, err: unknown): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}error=${encodeURIComponent(errorMessage(err))}`);
}

// ---------------------------------------------------------------------------
// Perfil / onboarding
// ---------------------------------------------------------------------------
export async function saveProfileAction(formData: FormData) {
  const { supabase, user } = await requireUser();
  const returnTo = formData.get("returnTo") === "/profile" ? "/profile" : "/dashboard";
  const errorPath = returnTo === "/profile" ? "/profile" : "/onboarding";
  const parsed = ProfileInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) withError(errorPath, new DomainError("Revisa los campos: " + parsed.error.issues.map((i) => i.path.join(".")).join(", ")));
  const p = parsed.data;
  const { error } = await supabase
    .from("user_profiles")
    .upsert({
      user_id: user.id,
      full_name: p.full_name,
      institution_name: p.institution_name,
      program_name: p.program_name,
      academic_period: p.academic_period || null,
      interests: p.interests,
      prior_knowledge: p.prior_knowledge || null,
      tools_known: p.tools_known,
      project_experience: p.project_experience,
      career_goals: p.career_goals || null,
      weekly_hours: p.weekly_hours,
      preferred_language: p.preferred_language,
      hardware_access: p.hardware_access || null,
      onboarding_completed_at: new Date().toISOString(),
    });
  if (error) withError(errorPath, new DomainError("No se pudo guardar tu perfil."));
  // Habilidades declaradas (distintas de las demostradas).
  await supabase.from("user_skills").delete().eq("user_id", user.id).eq("source", "declared");
  if (p.tools_known.length) {
    await supabase.from("user_skills").insert(
      p.tools_known.map((t) => ({ user_id: user.id, skill_name: t.slice(0, 200), source: "declared" })),
    );
  }
  revalidatePath("/", "layout");
  redirect(returnTo === "/profile" ? "/profile?saved=1" : "/dashboard");
}

export async function setHelpLevelAction(formData: FormData) {
  const { supabase, user } = await requireUser();
  const level = z.coerce.number().int().min(1).max(5).safeParse(formData.get("level"));
  if (level.success) await supabase.from("user_profiles").update({ tutor_help_level: level.data }).eq("user_id", user.id);
  revalidatePath("/settings");
}

// ---------------------------------------------------------------------------
// Retos
// ---------------------------------------------------------------------------
export async function createGoalAction(formData: FormData) {
  const { supabase, user, profile } = await requireOnboardedUser();
  const parsed = GoalInput.safeParse({ goal: formData.get("goal"), clarification: formData.get("clarification") || undefined });
  if (!parsed.success) withError("/challenges/new", new DomainError(parsed.error.issues[0]?.message ?? "Objetivo inválido."));
  let goalId: string;
  try {
    const student = await loadStudentContext(supabase, profile);
    goalId = await createGoalWithProposals(supabase, user.id, student, parsed.data.goal, parsed.data.clarification);
  } catch (err) {
    withError("/challenges/new", err);
  }
  redirect(`/goals/${goalId}`);
}

export async function refineGoalAction(formData: FormData) {
  const { supabase, user, profile } = await requireOnboardedUser();
  const goalId = uuid.parse(formData.get("goalId"));
  const clarification = z.string().trim().min(2).max(2000).safeParse(formData.get("clarification"));
  if (!clarification.success) withError(`/goals/${goalId}`, new DomainError("Escribe tu respuesta."));
  const { data: goal } = await supabase.from("learning_goals").select("raw_text").eq("id", goalId).maybeSingle();
  if (!goal) withError("/dashboard", new DomainError("Objetivo no encontrado."));
  try {
    const student = await loadStudentContext(supabase, profile);
    await supabase.from("challenges").update({ status: "discarded" }).eq("learning_goal_id", goalId).eq("status", "proposed");
    await supabase.from("learning_goals").update({ clarification: { answer: clarification.data } }).eq("id", goalId);
    await runDesign(supabase, user.id, student, goalId, goal.raw_text as string, clarification.data);
  } catch (err) {
    withError(`/goals/${goalId}`, err);
  }
  revalidatePath(`/goals/${goalId}`);
  redirect(`/goals/${goalId}`);
}

export async function retryGoalAction(formData: FormData) {
  const { supabase, user, profile } = await requireOnboardedUser();
  const goalId = uuid.parse(formData.get("goalId"));
  const { data: goal } = await supabase.from("learning_goals").select("raw_text, clarification").eq("id", goalId).maybeSingle();
  if (!goal) withError("/dashboard", new DomainError("Objetivo no encontrado."));
  try {
    const student = await loadStudentContext(supabase, profile);
    const c = (goal.clarification as { answer?: string } | null)?.answer;
    await runDesign(supabase, user.id, student, goalId, goal.raw_text as string, c);
  } catch (err) {
    withError(`/goals/${goalId}`, err);
  }
  redirect(`/goals/${goalId}`);
}

export async function acceptChallengeAction(formData: FormData) {
  const { supabase, user, profile } = await requireOnboardedUser();
  const challengeId = uuid.parse(formData.get("challengeId"));
  const goalId = formData.get("goalId");
  let projectId: string;
  try {
    const student = await loadStudentContext(supabase, profile);
    projectId = await acceptChallenge(supabase, user.id, student, challengeId);
  } catch (err) {
    withError(typeof goalId === "string" && uuid.safeParse(goalId).success ? `/goals/${goalId}` : "/dashboard", err);
  }
  redirect(`/projects/${projectId}`);
}

// ---------------------------------------------------------------------------
// Módulos y conceptos
// ---------------------------------------------------------------------------
export async function startModuleAction(formData: FormData) {
  const { supabase, user } = await requireOnboardedUser();
  const moduleId = uuid.parse(formData.get("moduleId"));
  const projectId = uuid.parse(formData.get("projectId"));
  const target = z.enum(["preparing", "in_progress"]).parse(formData.get("status"));
  const { data: mod } = await supabase.from("challenge_modules").select("status").eq("id", moduleId).maybeSingle();
  if (mod && (mod.status === "pending" || (mod.status === "preparing" && target === "in_progress"))) {
    await supabase.from("challenge_modules").update({ status: target, started_at: new Date().toISOString() }).eq("id", moduleId);
    await supabase.from("student_projects").update({ last_module_id: moduleId }).eq("id", projectId);
    await logProgress(supabase, user.id, { type: "module_status_changed", projectId, moduleId, payload: { to: target } });
  }
  revalidatePath(`/projects/${projectId}/modules/${moduleId}`);
}

export async function toggleTaskAction(formData: FormData) {
  const { supabase } = await requireOnboardedUser();
  const taskId = uuid.parse(formData.get("taskId"));
  const done = formData.get("done") === "true";
  await supabase.from("module_tasks").update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", taskId);
  const path = formData.get("path");
  if (typeof path === "string" && path.startsWith("/projects/")) revalidatePath(path);
}

export async function studyConceptAction(formData: FormData) {
  const { supabase, user, profile } = await requireOnboardedUser();
  const mcId = uuid.parse(formData.get("moduleConceptId"));
  const back = z.string().startsWith("/projects/").parse(formData.get("path"));
  try {
    const student = await loadStudentContext(supabase, profile);
    await studyConcept(supabase, user.id, student, mcId, { force: formData.get("force") === "1" });
  } catch (err) {
    withError(back, err);
  }
  redirect(back);
}

export async function markKnownAction(formData: FormData) {
  const { supabase, user } = await requireOnboardedUser();
  const mcId = uuid.parse(formData.get("moduleConceptId"));
  const back = z.string().startsWith("/projects/").parse(formData.get("path"));
  try {
    await markConceptKnown(supabase, user.id, mcId);
  } catch (err) {
    withError(back, err);
  }
  revalidatePath(back);
  redirect(back);
}

export async function practiceAction(formData: FormData) {
  const { supabase, user, profile } = await requireOnboardedUser();
  const exerciseId = uuid.parse(formData.get("exerciseId"));
  const back = z.string().startsWith("/projects/").parse(formData.get("path"));
  const answer = z.string().trim().min(1).max(20000).safeParse(formData.get("answer"));
  if (!answer.success) withError(back, new DomainError("Escribe tu respuesta."));
  try {
    const student = await loadStudentContext(supabase, profile);
    await submitPracticeAttempt(supabase, user.id, student, exerciseId, answer.data);
  } catch (err) {
    withError(back, err);
  }
  revalidatePath(back);
  redirect(`${back}#practica`);
}

export async function toggleSavedResourceAction(formData: FormData) {
  const { supabase } = await requireOnboardedUser();
  const id = uuid.parse(formData.get("conceptResourceId"));
  const saved = formData.get("saved") === "true";
  await supabase.from("concept_resources").update({ saved }).eq("id", id);
  const path = formData.get("path");
  if (typeof path === "string" && path.startsWith("/")) revalidatePath(path);
}

// ---------------------------------------------------------------------------
// Evidencias, cierre y portafolio
// ---------------------------------------------------------------------------
export async function submitEvidenceAction(formData: FormData) {
  const { supabase, user, profile } = await requireOnboardedUser();
  const moduleId = uuid.parse(formData.get("moduleId"));
  const projectId = uuid.parse(formData.get("projectId"));
  const back = `/projects/${projectId}/modules/${moduleId}`;
  const file = formData.get("file");
  try {
    const student = await loadStudentContext(supabase, profile);
    await submitAndEvaluate(supabase, user.id, student, moduleId, {
      body: String(formData.get("body") ?? "").slice(0, 50000),
      url: String(formData.get("url") ?? ""),
      file: file instanceof File && file.size > 0 ? file : null,
    });
  } catch (err) {
    withError(back, err);
  }
  revalidatePath(back);
  redirect(`${back}#evaluacion`);
}

export async function completeProjectAction(formData: FormData) {
  const { supabase, user, profile } = await requireOnboardedUser();
  const projectId = uuid.parse(formData.get("projectId"));
  try {
    const student = await loadStudentContext(supabase, profile);
    await completeProjectAndGeneratePortfolio(supabase, user.id, student, projectId);
  } catch (err) {
    withError(`/projects/${projectId}`, err);
  }
  const { data: item } = await supabase.from("portfolio_items").select("id").eq("project_id", projectId).maybeSingle();
  redirect(item ? `/portfolio/${item.id}` : "/portfolio");
}

export async function updatePortfolioAction(formData: FormData) {
  const { supabase } = await requireOnboardedUser();
  const id = uuid.parse(formData.get("id"));
  const lines = (k: string) =>
    String(formData.get(k) ?? "")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
  const parsed = PortfolioContent.safeParse({
    title: formData.get("title"),
    executive_summary: formData.get("executive_summary"),
    problem: formData.get("problem"),
    objectives: lines("objectives"),
    methodology: formData.get("methodology"),
    technologies: lines("technologies"),
    architecture: formData.get("architecture"),
    results: formData.get("results"),
    metrics: lines("metrics"),
    limitations: lines("limitations"),
    learnings: lines("learnings"),
    competencies: lines("competencies"),
    repository_url: formData.get("repository_url") ?? "",
    demo_url: formData.get("demo_url") ?? "",
  });
  if (!parsed.success) withError(`/portfolio/${id}`, new DomainError("Revisa los campos del portafolio."));
  for (const u of [parsed.data.repository_url, parsed.data.demo_url]) {
    if (u && !/^https:\/\//.test(u)) withError(`/portfolio/${id}`, new DomainError("Las URLs deben empezar con https://"));
  }
  await supabase.from("portfolio_items").update({ content: parsed.data }).eq("id", id);
  revalidatePath(`/portfolio/${id}`);
  redirect(`/portfolio/${id}?saved=1`);
}

export async function setPortfolioVisibilityAction(formData: FormData) {
  const { supabase } = await requireOnboardedUser();
  const id = uuid.parse(formData.get("id"));
  const visibility = z.enum(["private", "public"]).parse(formData.get("visibility"));
  await supabase.from("portfolio_items").update({ visibility }).eq("id", id);
  revalidatePath(`/portfolio/${id}`);
}

// ---------------------------------------------------------------------------
// Privacidad: eliminación de cuenta y datos
// ---------------------------------------------------------------------------
export async function deleteAccountAction(formData: FormData) {
  const { supabase, user } = await requireUser();
  if (formData.get("confirm") !== "ELIMINAR") withError("/settings", new DomainError('Escribe ELIMINAR para confirmar.'));
  try {
    const admin = createAdminClient();
    // Archivos de evidencia (Storage no cae por cascada).
    const { data: files } = await admin.from("submission_files").select("storage_path").eq("user_id", user.id);
    const paths = (files ?? []).map((f: { storage_path: string }) => f.storage_path);
    if (paths.length) await admin.storage.from("evidence").remove(paths);
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw new DomainError("No se pudo eliminar la cuenta.");
  } catch (err) {
    withError("/settings", err);
  }
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}
