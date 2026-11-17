import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, Lightbulb, MessageCircle, RefreshCw, XCircle } from "lucide-react";
import { Alert, Badge, Card, CardTitle, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/submit-button";
import { Markdown } from "@/components/markdown";
import { ConceptStatusBadge } from "@/components/app/status";
import { ResourceCard, type ResourceView } from "@/components/app/resource-card";
import type { PracticeFeedback } from "@/domain/schemas";
import type { StoredKnowledgeCard } from "@/server/services/learning";
import { requireOnboardedUser } from "@/server/services/session";
import { markKnownAction, practiceAction, studyConceptAction } from "../../../../../../actions";

export const metadata = { title: "Tarjeta de conocimiento" };
export const maxDuration = 300;

const PROVIDER_STATUS: Record<string, string> = { ok: "consultado", cached: "desde caché", not_configured: "configuración pendiente", error: "error" };

export default async function ConceptPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; moduleId: string; mcId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { projectId, moduleId, mcId } = await params;
  const { error } = await searchParams;
  const { supabase } = await requireOnboardedUser();
  const path = `/projects/${projectId}/modules/${moduleId}/concepts/${mcId}`;
  const back = `/projects/${projectId}/modules/${moduleId}`;

  const { data: mc } = await supabase
    .from("module_concepts")
    .select("id, status, why_needed, is_fundamental, prerequisite_concepts, estimated_minutes_min, estimated_minutes_max, knowledge_card, module_id, knowledge_concepts(name), challenge_modules(title, project_id)")
    .eq("id", mcId)
    .eq("module_id", moduleId)
    .maybeSingle();
  if (!mc) notFound();
  const name = (mc.knowledge_concepts as unknown as { name: string }).name;
  const mod = mc.challenge_modules as unknown as { title: string; project_id: string };
  if (mod.project_id !== projectId) notFound();
  const card = mc.knowledge_card as StoredKnowledgeCard | null;

  const [{ data: resources }, { data: exercises }] = await Promise.all([
    supabase
      .from("concept_resources")
      .select("id, rank, reason, confidence, saved, resource:external_resources(id, provider_id, external_id, canonical_url, title, authors, organization, published_at, resource_type, license, is_open_access, peer_reviewed, duration_seconds, doi, metadata, provenance, resource_segments(id, label, start_seconds, end_seconds, verification, verification_source))")
      .eq("module_concept_id", mcId)
      .order("rank"),
    supabase
      .from("practice_exercises")
      .select("id, prompt, expected_output_kind, verification_criteria, hints, created_at, practice_attempts(id, answer, passed, feedback, created_at)")
      .eq("module_concept_id", mcId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const exercise = exercises?.[0] as
    | { id: string; prompt: string; verification_criteria: string[]; hints: string[]; practice_attempts: { id: string; answer: string; passed: boolean | null; feedback: PracticeFeedback | null; created_at: string }[] }
    | undefined;
  const attempts = (exercise?.practice_attempts ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href={back} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a la tarea · {mod.title}
      </Link>
      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Concepto</p>
            <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          </div>
          <div className="flex gap-1.5">
            {mc.is_fundamental && <Badge tone="warning">Fundamental</Badge>}
            <ConceptStatusBadge status={mc.status} />
          </div>
        </div>
        <p className="mt-3 text-sm"><strong>Por qué necesitas aprenderlo:</strong> {card?.why_you_need_it ?? mc.why_needed}</p>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" /> Tiempo aproximado: {card?.estimated_minutes_min ?? mc.estimated_minutes_min}–{card?.estimated_minutes_max ?? mc.estimated_minutes_max} minutos
        </p>
        {(mc.prerequisite_concepts as string[]).length > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">Prerrequisitos: {(mc.prerequisite_concepts as string[]).join(", ")}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {!card && (
            <form action={studyConceptAction}>
              <input type="hidden" name="moduleConceptId" value={mcId} />
              <input type="hidden" name="path" value={path} />
              <SubmitButton pendingText="Buscando y verificando fuentes…">Estudiar este concepto</SubmitButton>
            </form>
          )}
          {mc.status !== "mastered" && mc.status !== "skipped_known" && !mc.is_fundamental && (
            <form action={markKnownAction}>
              <input type="hidden" name="moduleConceptId" value={mcId} />
              <input type="hidden" name="path" value={back} />
              <SubmitButton variant="outline" pendingText="Guardando…">Ya domino este concepto</SubmitButton>
            </form>
          )}
          {mc.is_fundamental && mc.status !== "mastered" && (
            <p className="text-xs text-muted-foreground">Es fundamental: para omitirlo resuelve la práctica de comprobación.</p>
          )}
          <Link href={`${back}#tutor`} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted"><MessageCircle className="h-4 w-4" /> Preguntar a la IA</Link>
        </div>
      </Card>

      {card && (
        <>
          <Card>
            <CardTitle className="flex items-center gap-2"><Lightbulb className="h-4 w-4" /> Explicación contextual (generada por IA)</CardTitle>
            <div className="mt-2"><Markdown>{card.explanation_markdown}</Markdown></div>
            {card.worked_example_markdown && (
              <>
                <CardTitle className="mt-4">Ejemplo trabajado</CardTitle>
                <div className="mt-2"><Markdown>{card.worked_example_markdown}</Markdown></div>
              </>
            )}
          </Card>

          <section className="space-y-3" aria-labelledby="recursos">
            <h2 id="recursos" className="text-sm font-semibold">Dónde estudiarlo</h2>
            {(resources ?? []).length === 0 && <Alert tone="warning">No se recuperaron recursos verificables de los proveedores para este concepto. La explicación anterior no está respaldada por fuentes externas.</Alert>}
            {(resources ?? []).map((r) => <ResourceCard key={r.id} r={r as unknown as ResourceView} path={path} />)}
            {card.limitations && <Alert>{card.limitations}</Alert>}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Proveedores consultados</summary>
              <ul className="mt-1 space-y-0.5">
                {card.provider_report.map((p, i) => (
                  <li key={i}>{p.provider}: “{p.query}” · {PROVIDER_STATUS[p.status] ?? p.status} · {p.count} resultados{p.error ? ` · ${p.error}` : ""}</li>
                ))}
              </ul>
              <form action={studyConceptAction} className="mt-2">
                <input type="hidden" name="moduleConceptId" value={mcId} />
                <input type="hidden" name="path" value={path} />
                <input type="hidden" name="force" value="1" />
                <SubmitButton size="sm" variant="ghost" pendingText="Regenerando…"><RefreshCw className="h-3 w-3" /> Buscar de nuevo</SubmitButton>
              </form>
            </details>
          </section>
        </>
      )}

      {exercise && (
        <Card id="practica" className="space-y-3">
          <CardTitle>Práctica</CardTitle>
          <Markdown>{exercise.prompt}</Markdown>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Verificación</p>
            <ul className="list-disc pl-5 text-sm">{exercise.verification_criteria.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
          {exercise.hints.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs text-muted-foreground">Pistas</summary>
              <ol className="mt-1 list-decimal pl-5">{exercise.hints.map((h) => <li key={h}>{h}</li>)}</ol>
            </details>
          )}
          {mc.status !== "mastered" && (
            <form action={practiceAction} className="space-y-2">
              <input type="hidden" name="exerciseId" value={exercise.id} />
              <input type="hidden" name="path" value={path} />
              <Textarea name="answer" rows={8} required maxLength={20000} className="font-mono text-xs" placeholder="Tu solución (código, desarrollo o explicación)…" />
              <div className="flex justify-end"><SubmitButton pendingText="Verificando…">Enviar práctica</SubmitButton></div>
            </form>
          )}
          {attempts.map((a) => (
            <div key={a.id} className="rounded-md border p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                {a.passed ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-danger" />}
                {a.passed ? "Práctica aprobada" : "Aún no"}
              </p>
              {a.feedback && (
                <>
                  <div className="mt-2"><Markdown>{a.feedback.feedback_markdown}</Markdown></div>
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {a.feedback.criteria_results.map((c) => <li key={c.criterion}>{c.met ? "✓" : "✗"} {c.criterion} — {c.comment}</li>)}
                  </ul>
                </>
              )}
            </div>
          ))}
          {mc.status === "mastered" && (
            <Link href={back} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Volver al proyecto</Link>
          )}
        </Card>
      )}
    </div>
  );
}
