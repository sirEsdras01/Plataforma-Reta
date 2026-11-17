import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PortfolioEvidence } from "@/domain/portfolio";

/** Última evidencia (y su evaluación) por módulo del proyecto. */
export async function loadPortfolioEvidence(supabase: SupabaseClient, projectId: string): Promise<PortfolioEvidence[]> {
  const { data } = await supabase
    .from("challenge_modules")
    .select("position, title, main_deliverable, submissions(url, evidence_status, created_at, evaluations(overall_score, outcome))")
    .eq("project_id", projectId)
    .order("position");
  type Row = { title: string; main_deliverable: string; submissions: { url: string | null; evidence_status: string; created_at: string; evaluations: { overall_score: number; outcome: string }[] }[] };
  return ((data ?? []) as unknown as Row[]).map((m) => {
    const accepted = m.submissions
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .find((s) => s.evaluations.some((e) => e.outcome === "accepted")) ?? m.submissions[0];
    const ev = accepted?.evaluations.find((e) => e.outcome === "accepted") ?? accepted?.evaluations[0];
    return {
      moduleTitle: m.title,
      deliverable: m.main_deliverable,
      evidenceStatus: accepted?.evidence_status ?? "received",
      outcome: ev?.outcome ?? null,
      score: ev ? Number(ev.overall_score) : null,
      url: accepted?.url ?? null,
    };
  });
}
