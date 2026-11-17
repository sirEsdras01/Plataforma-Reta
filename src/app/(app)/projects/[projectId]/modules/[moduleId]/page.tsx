import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, CheckSquare, ChevronLeft, FileCheck2, Lock, Sparkles, Square, Upload } from "lucide-react";
import { Alert, Badge, Card, CardTitle, Input, Label, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/submit-button";
import { ConceptStatusBadge, ModuleStatusBadge } from "@/components/app/status";
import { TutorChat } from "@/components/app/tutor-chat";
import { isUnlocked, type ModuleLite } from "@/domain/progress";
import type { ModuleStatus, RubricCriterion } from "@/domain/schemas";
import { requireOnboardedUser } from "@/server/services/session";
import { formatDate } from "@/lib/utils";
import { startModuleAction, studyConceptAction, submitEvidenceAction, toggleTaskAction } from "../../../../actions";

export const metadata = { title: "Workspace del módulo" };
export const maxDuration = 300;

const EVIDENCE_LABEL: Record<string, { label: string; tone: "neutral" | "primary" | "success" | "warning" }> = {
  received: { label: "Evidencia recibida (no inspeccionada)", tone: "neutral" },
  analyzed: { label: "Evidencia analizada por IA", tone: "primary" },
  verified: { label: "Resultado verificado", tone: "success" },
  pending_review: { label: "Pendiente de revisión humana", tone: "warning" },
};
const OUTCOME: Record<string, { label: string; tone: "success" | "warning" | "danger" }> = {
  accepted: { label: "Aceptado", tone: "success" },
  needs_changes: { label: "Requiere correcciones", tone: "warning" },
  insufficient_evidence: { label: "Evidencia insuficiente", tone: "danger" },
};

export default async function ModuleWorkspace({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; moduleId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { projectId, moduleId } = await params;
  const { error } = await searchParams;
  const { supabase, profile } = await requireOnboardedUser();
  const path = `/projects/${projectId}/modules/${moduleId}`;

  const [{ data: project }, { data: modules }, { data: mod }] = await Promise.all([
    supabase.from("student_projects").select("id, title, progress_pct").eq("id", projectId).maybeSingle(),
    supabase
      .from("challenge_modules")
      .select("id, position, title, status, module_dependencies!module_dependencies_module_id_fkey(depends_on_module_id)")
      .eq("project_id", projectId)
      .order("position"),
    supabase
      .from("challenge_modules")
      .select(
        "*, module_tasks(id, position, title, done), module_concepts(id, status, why_needed, is_fundamental, estimated_minutes_min, estimated_minutes_max, knowledge_card, knowledge_concepts(name)), evaluation_rubrics(criteria, passing_score)",
      )
      .eq("id", moduleId)
      .eq("project_id", projectId)
      .maybeSingle(),
  ]);
  if (!project || !mod) notFound();

  type L = { id: string; position: number; title: string; status: ModuleStatus; module_dependencies: { depends_on_module_id: string }[] };
  const list = (modules ?? []) as unknown as L[];
  const lite: ModuleLite[] = list.map((m) => ({ id: m.id, position: m.position, status: m.status, dependsOn: m.module_dependencies.map((d) => d.depends_on_module_id) }));
  const unlocked = isUnlocked(lite.find((l) => l.id === moduleId)!, lite);

  const { data: submissions } = await supabase
    .from("submissions")
    .select("id, kind, body, url, evidence_status, inspection_notes, created_at, submission_files(file_name, inspected), evaluations(id, overall_score, outcome, summary, strengths, improvements, criterion_scores, created_at)")
    .eq("module_id", moduleId)
    .order("created_at", { ascending: false });
  const { data: conv } = await supabase
    .from("tutor_conversations")
    .select("id, tutor_messages(role, content, created_at)")
    .eq("module_id", moduleId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const convMessages = ((conv?.tutor_messages ?? []) as { role: "user" | "assistant"; content: string; created_at: string }[])
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(-30)
    .map(({ role, content }) => ({ role, content }));

  type MC = { id: string; status: string; why_needed: string; is_fundamental: boolean; estimated_minutes_min: number | null; estimated_minutes_max: number | null; knowledge_card: unknown; knowledge_concepts: { name: string } };
  const concepts = (mod.module_concepts as MC[]) ?? [];
  const tasks = ((mod.module_tasks as { id: string; position: number; title: string; done: boolean }[]) ?? []).sort((a, b) => a.position - b.position);
  const rubricRow = mod.evaluation_rubrics as unknown as { criteria: RubricCriterion[]; passing_score: number } | null;
  const status = mod.status as ModuleStatus;

  return (
    <div className="mx-auto max-w-[1400px]">
      <Link href={`/projects/${projectId}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> {project.title}
      </Link>
      {error && <div className="mb-4"><Alert tone="danger">{error}</Alert></div>}

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_360px]">
        {/* Panel izquierdo: navegación de módulos, tareas, progreso */}
        <aside className="space-y-4" aria-label="Navegación del proyecto">
          <Card className="p-3">
            <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">Módulos · {Math.round(Number(project.progress_pct))}%</p>
            <ul className="space-y-0.5">
              {list.map((m) => {
                const u = isUnlocked(lite.find((l) => l.id === m.id)!, lite);
                return (
                  <li key={m.id}>
                    {u ? (
                      <Link href={`/projects/${projectId}/modules/${m.id}`} aria-current={m.id === moduleId ? "page" : undefined} className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted ${m.id === moduleId ? "bg-muted font-medium" : ""}`}>
                        <span className="truncate">{m.position}. {m.title}</span>
                        {m.status === "completed" && <span className="text-success" aria-label="Completado">✓</span>}
                      </Link>
                    ) : (
                      <span className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground"><Lock className="h-3 w-3" /> <span className="truncate">{m.position}. {m.title}</span></span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card className="p-3">
            <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">Tareas técnicas</p>
            <ul className="space-y-1">
              {tasks.map((t) => (
                <li key={t.id}>
                  <form action={toggleTaskAction}>
                    <input type="hidden" name="taskId" value={t.id} />
                    <input type="hidden" name="done" value={String(!t.done)} />
                    <input type="hidden" name="path" value={path} />
                    <button type="submit" className="flex w-full items-start gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted" aria-pressed={t.done}>
                      {t.done ? <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <Square className="mt-0.5 h-4 w-4 shrink-0" />}
                      <span className={t.done ? "text-muted-foreground line-through" : ""}>{t.title}</span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        </aside>

        {/* Panel central: objetivo, instrucciones, entregables, evidencias */}
        <section className="min-w-0 space-y-4">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Módulo {mod.position}{mod.effort_estimate ? ` · ${mod.effort_estimate}` : ""}</p>
                <h1 className="text-xl font-semibold tracking-tight">{mod.title}</h1>
              </div>
              <ModuleStatusBadge status={status} />
            </div>
            {!unlocked && <div className="mt-3"><Alert tone="warning">Este módulo depende de módulos anteriores que aún no están completados.</Alert></div>}
            <p className="mt-3 text-sm"><strong>Objetivo técnico:</strong> {mod.technical_objective}</p>
            <p className="mt-2 text-sm text-muted-foreground">{mod.description}</p>
            {(status === "pending" || status === "preparing") && unlocked && (
              <form action={startModuleAction} className="mt-4 flex gap-2">
                <input type="hidden" name="moduleId" value={moduleId} />
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="status" value={status === "pending" ? "preparing" : "in_progress"} />
                <SubmitButton size="sm">{status === "pending" ? "Comenzar preparación" : "Pasar a desarrollo"}</SubmitButton>
              </form>
            )}
          </Card>

          <Card className="grid gap-4 md:grid-cols-2">
            <div>
              <CardTitle>Entregable principal</CardTitle>
              <p className="mt-1 text-sm">{mod.main_deliverable}</p>
              <CardTitle className="mt-4">Evidencias requeridas</CardTitle>
              <ul className="mt-1 list-disc pl-5 text-sm">{(mod.required_evidence as string[]).map((e) => <li key={e}>{e}</li>)}</ul>
              {(mod.tools as string[]).length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">{(mod.tools as string[]).map((t) => <Badge key={t}>{t}</Badge>)}</div>
              )}
            </div>
            <div>
              <CardTitle>Criterios de aceptación</CardTitle>
              <ul className="mt-1 list-disc pl-5 text-sm">{(mod.acceptance_criteria as string[]).map((c) => <li key={c}>{c}</li>)}</ul>
              {rubricRow && (
                <>
                  <CardTitle className="mt-4">Rúbrica (aprobación ≥ {Number(rubricRow.passing_score)})</CardTitle>
                  <ul className="mt-1 space-y-1 text-sm">
                    {rubricRow.criteria.map((c) => (
                      <li key={c.id}><span className="font-medium">{c.name}</span> <span className="text-xs text-muted-foreground">peso {c.weight}</span><br /><span className="text-muted-foreground">{c.description}</span></li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </Card>

          {unlocked && status !== "completed" && (
            <Card id="entrega">
              <CardTitle className="flex items-center gap-2"><Upload className="h-4 w-4" /> Entregar evidencia</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Se inspecciona: texto, repositorios públicos de GitHub (README y estructura) y archivos de texto/código. Otros enlaces y archivos binarios se guardan como “recibidos” sin inspección. El código no se ejecuta en el servidor.
              </p>
              <form action={submitEvidenceAction} className="mt-4 space-y-3">
                <input type="hidden" name="moduleId" value={moduleId} />
                <input type="hidden" name="projectId" value={projectId} />
                <div>
                  <Label htmlFor="body">Descripción técnica, resultados y decisiones</Label>
                  <Textarea id="body" name="body" rows={6} maxLength={50000} placeholder="Explica qué hiciste, por qué, qué resultados obtuviste y qué limitaciones reconoces." />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="url">Enlace (repositorio GitHub, demo, documento)</Label>
                    <Input id="url" name="url" type="url" pattern="https://.*" placeholder="https://github.com/usuario/proyecto" />
                  </div>
                  <div>
                    <Label htmlFor="file">Archivo (máx. 20 MB)</Label>
                    <Input id="file" name="file" type="file" className="py-1.5" />
                  </div>
                </div>
                <div className="flex justify-end"><SubmitButton pendingText="Evaluando evidencia…"><FileCheck2 className="h-4 w-4" /> Enviar y evaluar</SubmitButton></div>
              </form>
            </Card>
          )}

          <div id="evaluacion" className="space-y-3">
            {(submissions ?? []).map((s) => {
              const ev = (s.evaluations as { id: string; overall_score: number; outcome: string; summary: string; strengths: string[]; improvements: string[]; criterion_scores: { criterion_id: string; score: number; justification: string; evidence_inspected: boolean }[] }[])[0];
              const es = EVIDENCE_LABEL[s.evidence_status as string] ?? EVIDENCE_LABEL.received!;
              return (
                <Card key={s.id} className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">Entrega del {formatDate(s.created_at)}</p>
                    <div className="flex gap-1.5">
                      <Badge tone={es.tone}>{es.label}</Badge>
                      {ev && <Badge tone={OUTCOME[ev.outcome]?.tone ?? "warning"}>{OUTCOME[ev.outcome]?.label ?? ev.outcome} · {Number(ev.overall_score)}/100</Badge>}
                    </div>
                  </div>
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Qué inspeccionó la plataforma</summary>
                    <ul className="mt-1 list-disc pl-5">{(s.inspection_notes as string[]).map((n) => <li key={n}>{n}</li>)}</ul>
                  </details>
                  {ev ? (
                    <>
                      <p className="text-sm">{ev.summary}</p>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div><p className="text-xs font-medium text-muted-foreground">Fortalezas</p><ul className="list-disc pl-5 text-sm">{ev.strengths.map((x) => <li key={x}>{x}</li>)}</ul></div>
                        <div><p className="text-xs font-medium text-muted-foreground">Mejoras</p><ul className="list-disc pl-5 text-sm">{ev.improvements.map((x) => <li key={x}>{x}</li>)}</ul></div>
                      </div>
                      <table className="w-full text-left text-xs">
                        <thead><tr className="text-muted-foreground"><th className="py-1">Criterio</th><th>Puntos</th><th>Justificación</th></tr></thead>
                        <tbody>
                          {ev.criterion_scores.map((c) => (
                            <tr key={c.criterion_id} className="border-t align-top">
                              <td className="py-1 pr-2 font-medium">{rubricRow?.criteria.find((r) => r.id === c.criterion_id)?.name ?? c.criterion_id}</td>
                              <td className="pr-2">{c.score}{!c.evidence_inspected && <span className="block text-warning">sin respaldo inspeccionado</span>}</td>
                              <td>{c.justification}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-[11px] text-muted-foreground">Evaluación generada con IA y alineada a la rúbrica. No es una calificación académica oficial.</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Evaluación pendiente.</p>
                  )}
                </Card>
              );
            })}
          </div>
        </section>

        {/* Panel derecho: conceptos necesarios + tutor */}
        <aside className="space-y-4" aria-label="Aprendizaje y tutor">
          <Card className="p-4">
            <CardTitle className="flex items-center gap-2"><BookOpen className="h-4 w-4" /> Lo que necesitas saber</CardTitle>
            <ul className="mt-3 space-y-3">
              {concepts.length === 0 && <li className="text-sm text-muted-foreground">Sin conceptos identificados.</li>}
              {concepts.map((c) => (
                <li key={c.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`${path}/concepts/${c.id}`} className="text-sm font-medium hover:underline">{c.knowledge_concepts.name}</Link>
                    {c.is_fundamental && <Badge tone="warning">Fundamental</Badge>}
                  </div>
                  <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{c.why_needed}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <ConceptStatusBadge status={c.status} />
                    {c.knowledge_card ? (
                      <Link className="text-xs text-primary hover:underline" href={`${path}/concepts/${c.id}`}>Abrir tarjeta</Link>
                    ) : (
                      unlocked && (
                        <form action={studyConceptAction}>
                          <input type="hidden" name="moduleConceptId" value={c.id} />
                          <input type="hidden" name="path" value={`${path}/concepts/${c.id}`} />
                          <SubmitButton size="sm" variant="subtle" pendingText="Buscando fuentes…"><Sparkles className="h-3 w-3" /> Aprender ahora</SubmitButton>
                        </form>
                      )
                    )}
                  </div>
                  {c.estimated_minutes_min != null && <p className="mt-1 text-[11px] text-muted-foreground">~{c.estimated_minutes_min}–{c.estimated_minutes_max} min</p>}
                </li>
              ))}
            </ul>
          </Card>
          <Card id="tutor" className="p-4">
            <CardTitle className="mb-3">Tutor del proyecto</CardTitle>
            <TutorChat
              projectId={projectId}
              moduleId={moduleId}
              initialConversationId={conv?.id}
              initialMessages={convMessages}
              defaultLevel={profile.tutor_help_level ?? 2}
            />
          </Card>
        </aside>
      </div>
    </div>
  );
}
