import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { connection } from "next/server";
import type { StudentContext } from "@/domain/schemas";

export interface ProfileRow {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  institution_name: string | null;
  program_name: string | null;
  academic_period: string | null;
  interests: string[];
  prior_knowledge: string | null;
  tools_known: string[];
  project_experience: string | null;
  career_goals: string | null;
  weekly_hours: number | null;
  preferred_language: string;
  hardware_access: string | null;
  tutor_help_level: number;
  onboarding_completed_at: string | null;
}

export interface Session {
  supabase: SupabaseClient;
  user: User;
}

/** Usuario autenticado verificado con el servidor de Auth (no solo la cookie). */
export async function requireUser(): Promise<Session> {
  await connection(); // siempre en tiempo de solicitud
  if (!isSupabaseConfigured()) redirect("/setup");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");
  return { supabase, user: data.user };
}

export async function getProfile(supabase: SupabaseClient, userId: string): Promise<ProfileRow | null> {
  const { data } = await supabase.from("user_profiles").select("*").eq("user_id", userId).maybeSingle();
  return (data as ProfileRow | null) ?? null;
}

/** Requiere usuario con onboarding completo; si no, lo envía al onboarding. */
export async function requireOnboardedUser(): Promise<Session & { profile: ProfileRow }> {
  const s = await requireUser();
  const profile = await getProfile(s.supabase, s.user.id);
  if (!profile?.onboarding_completed_at) redirect("/onboarding");
  return { ...s, profile };
}

export async function loadStudentContext(supabase: SupabaseClient, profile: ProfileRow): Promise<StudentContext> {
  const { data: skills } = await supabase
    .from("user_skills")
    .select("skill_name")
    .eq("user_id", profile.user_id)
    .eq("source", "demonstrated")
    .limit(50);
  return {
    programName: profile.program_name,
    institutionName: profile.institution_name,
    academicPeriod: profile.academic_period,
    interests: profile.interests ?? [],
    priorKnowledge: profile.prior_knowledge,
    toolsKnown: profile.tools_known ?? [],
    projectExperience: profile.project_experience,
    careerGoals: profile.career_goals,
    weeklyHours: profile.weekly_hours,
    preferredLanguage: profile.preferred_language || "es",
    hardwareAccess: profile.hardware_access,
    demonstratedSkills: (skills ?? []).map((s: { skill_name: string }) => s.skill_name),
  };
}

export async function logProgress(
  supabase: SupabaseClient,
  userId: string,
  event: {
    type: string;
    projectId?: string | null;
    moduleId?: string | null;
    moduleConceptId?: string | null;
    payload?: Record<string, unknown>;
  },
) {
  const { error } = await supabase.from("learning_progress").insert({
    user_id: userId,
    project_id: event.projectId ?? null,
    module_id: event.moduleId ?? null,
    module_concept_id: event.moduleConceptId ?? null,
    event_type: event.type,
    payload: event.payload ?? {},
  });
  if (error) console.error("[progress] log failed", error);
}

/** Inicio de la ventana de N días (fuera del render para mantener los componentes puros). */
export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 3600_000).toISOString();
}
