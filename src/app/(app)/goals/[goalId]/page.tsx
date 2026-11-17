import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, ExternalLink, HelpCircle, Target } from "lucide-react";
import { Alert, Badge, Card, CardTitle, PageHeader } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/submit-button";
import { Textarea } from "@/components/ui/primitives";
import type { ChallengeProposal, IntentAnalysis } from "@/domain/schemas";
import { requireOnboardedUser } from "@/server/services/session";
import { acceptChallengeAction, refineGoalAction, retryGoalAction } from "../../actions";

export const metadata = { title: "Propuestas de reto" };
export const maxDuration = 300;

const DIFFICULTY: Record<string, string> = { introductory: "Introductorio", intermediate: "Intermedio", advanced: "Avanzado", research: "Investigación" };

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}

function ProposalCard({ p, challengeId, goalId, status }: { p: ChallengeProposal; challengeId: string; goalId: string; status: string }) {
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{p.title}</h2>
        <div className="flex gap-1.5">
          <Badge tone="primary">{DIFFICULTY[p.difficulty] ?? p.difficulty}</Badge>
          <Badge>{p.duration_weeks_min}–{p.duration_weeks_max} semanas (estimado)</Badge>
          <Badge tone={p.origin === "industry_inspired" ? "warning" : "neutral"}>
            {p.origin === "industry_inspired" ? "Inspirado en un problema industrial real (no publicado por una organización)" : "Generado por IA"}
          </Badge>
        </div>
      </div>
      <p className="text-sm">{p.executive_summary}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Problema</p>
          <p className="text-sm">{p.problem_statement}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Aplicación en la industria</p>
          <p className="text-sm">{p.industry_application}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contexto real</p>
          <p className="text-sm">{p.real_world_context}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Producto final</p>
          <p className="text-sm">{p.final_product}</p>
        </div>
        <List title="Competencias que desarrollarás" items={p.competencies} />
        <List title="Conocimientos previos recomendados" items={p.recommended_prerequisites} />
        <List title="Entregables verificables" items={p.verifiable_deliverables} />
        <List title="Herramientas" items={p.tools} />
        <List title="Posibles extensiones" items={p.possible_extensions} />
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Datos y fuentes</p>
          <ul className="mt-1 space-y-1 text-sm">
            {p.data_sources.length === 0 && <li className="text-muted-foreground">Aún no se ha verificado una fuente de datos.</li>}
            {p.data_sources.map((d) => (
              <li key={d.name} className="flex flex-wrap items-center gap-1.5">
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">{d.name} <ExternalLink className="h-3 w-3" /></a>
                ) : (
                  d.name
                )}
                <Badge tone={d.verification === "well_known_public_source" ? "neutral" : "warning"}>
                  {d.verification === "well_known_public_source" ? "Fuente pública conocida · enlace no verificado por la plataforma" : "Sugerencia sin verificar"}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {p.scope_note && <Alert tone="warning"><strong>Alcance propuesto:</strong> {p.scope_note}</Alert>}
      <div className="rounded-lg bg-muted p-4 text-sm">
        <p><strong>Por qué es relevante:</strong> {p.why_relevant}</p>
        <p className="mt-2"><strong>Qué podrás demostrar:</strong> {p.what_you_will_demonstrate}</p>
        <p className="mt-2"><strong>Valor para tu portafolio:</strong> {p.portfolio_value}</p>
      </div>
      {status === "proposed" && (
        <form action={acceptChallengeAction} className="flex items-center justify-end gap-3">
          <input type="hidden" name="challengeId" value={challengeId} />
          <input type="hidden" name="goalId" value={goalId} />
          <p className="text-xs text-muted-foreground">Se generará tu ruta de módulos (1–2 minutos).</p>
          <SubmitButton pendingText="Diseñando tu ruta…"><Target className="h-4 w-4" /> Aceptar este reto</SubmitButton>
        </form>
      )}
      {status === "accepted" && <Badge tone="success"><CheckCircle2 className="h-3 w-3" /> Aceptado</Badge>}
    </Card>
  );
}

export default async function GoalPage({ params, searchParams }: { params: Promise<{ goalId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { goalId } = await params;
  const { error } = await searchParams;
  const { supabase } = await requireOnboardedUser();
  const { data: goal } = await supabase.from("learning_goals").select("*").eq("id", goalId).maybeSingle();
  if (!goal) notFound();
  const { data: challenges } = await supabase
    .from("challenges")
    .select("id, status, current_version_id, challenge_versions!challenge_versions_challenge_id_fkey(id, content)")
    .eq("learning_goal_id", goalId)
    .neq("status", "discarded")
    .order("created_at");
  const { data: project } = await supabase.from("student_projects").select("id, status, challenge_id").in("challenge_id", (challenges ?? []).map((c) => c.id)).maybeSingle();
  const intent = goal.intent as IntentAnalysis | null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Propuestas de reto" description={<>Tu objetivo: “{goal.raw_text}”</>} />
      {error && <Alert tone="danger">{error}</Alert>}
      {project?.status === "failed" && (
        <Alert tone="danger">La generación de la ruta falló. Puedes intentarlo de nuevo con el botón “Aceptar este reto”.</Alert>
      )}
      {goal.status === "failed" && (
        <Card className="space-y-3">
          <p className="flex items-center gap-2 text-sm"><AlertTriangle className="h-4 w-4 text-danger" /> No se pudieron generar propuestas. Tu objetivo quedó guardado.</p>
          <form action={retryGoalAction}>
            <input type="hidden" name="goalId" value={goalId} />
            <SubmitButton pendingText="Reintentando…">Reintentar</SubmitButton>
          </form>
        </Card>
      )}
      {intent && (
        <Card>
          <CardTitle>Lo que entendimos</CardTitle>
          <p className="mt-2 text-sm">{intent.summary}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {intent.engineering_areas.map((a) => <Badge key={a} tone="primary">{a}</Badge>)}
          </div>
        </Card>
      )}
      {intent && intent.clarifying_questions.length > 0 && (
        <Card className="space-y-3">
          <CardTitle className="flex items-center gap-2"><HelpCircle className="h-4 w-4" /> Para afinar tu reto (opcional)</CardTitle>
          <ul className="list-disc pl-5 text-sm">{intent.clarifying_questions.map((q) => <li key={q}>{q}</li>)}</ul>
          <form action={refineGoalAction} className="space-y-2">
            <input type="hidden" name="goalId" value={goalId} />
            <Textarea name="clarification" required placeholder="Tu respuesta…" />
            <div className="flex justify-end"><SubmitButton variant="outline" pendingText="Rediseñando…">Regenerar con mi respuesta</SubmitButton></div>
          </form>
        </Card>
      )}
      {(challenges ?? []).map((c) => {
        const versions = c.challenge_versions as unknown as { id: string; content: ChallengeProposal }[];
        const v = versions.find((x) => x.id === c.current_version_id) ?? versions[0];
        return v ? <ProposalCard key={c.id} p={v.content} challengeId={c.id} goalId={goalId} status={c.status} /> : null;
      })}
    </div>
  );
}
