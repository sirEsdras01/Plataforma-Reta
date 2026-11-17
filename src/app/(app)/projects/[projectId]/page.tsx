import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Lock, Trophy } from "lucide-react";
import { Alert, Badge, Card, PageHeader, Progress } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/submit-button";
import { ModuleStatusBadge } from "@/components/app/status";
import { isUnlocked, nextModule, type ModuleLite } from "@/domain/progress";
import type { ChallengeProposal, ModuleStatus } from "@/domain/schemas";
import { requireOnboardedUser } from "@/server/services/session";
import { acceptChallengeAction, completeProjectAction } from "../../actions";

export const metadata = { title: "Ruta del proyecto" };
export const maxDuration = 300;

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { projectId } = await params;
  const { error } = await searchParams;
  const { supabase } = await requireOnboardedUser();
  const { data: project } = await supabase
    .from("student_projects")
    .select("id, title, status, progress_pct, error_message, challenge_id, last_module_id, challenge_versions(content)")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) notFound();
  const { data: modules } = await supabase
    .from("challenge_modules")
    .select("id, position, title, technical_objective, main_deliverable, effort_estimate, status, module_dependencies!module_dependencies_module_id_fkey(depends_on_module_id), module_concepts(id, status)")
    .eq("project_id", projectId)
    .order("position");
  const { data: portfolio } = await supabase.from("portfolio_items").select("id").eq("project_id", projectId).maybeSingle();

  type Row = { id: string; position: number; title: string; technical_objective: string; main_deliverable: string; effort_estimate: string | null; status: ModuleStatus; module_dependencies: { depends_on_module_id: string }[]; module_concepts: { id: string; status: string }[] };
  const rows = (modules ?? []) as unknown as Row[];
  const lite: ModuleLite[] = rows.map((m) => ({ id: m.id, position: m.position, status: m.status, dependsOn: m.module_dependencies.map((d) => d.depends_on_module_id) }));
  const next = nextModule(lite);
  const resume = project.last_module_id && rows.find((r) => r.id === project.last_module_id && r.status !== "completed") ? project.last_module_id : next?.id;
  const proposal = (project.challenge_versions as unknown as { content: ChallengeProposal }).content;
  const allDone = rows.length > 0 && rows.every((r) => r.status === "completed");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={project.title}
        description={proposal.executive_summary}
        actions={
          resume ? (
            <Link href={`/projects/${projectId}/modules/${resume}`} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
              Continuar donde me quedé <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null
        }
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {project.status === "failed" && (
        <Card className="space-y-3">
          <Alert tone="danger">No se pudo generar la ruta de aprendizaje. Tu reto sigue guardado.</Alert>
          <form action={acceptChallengeAction}>
            <input type="hidden" name="challengeId" value={project.challenge_id} />
            <SubmitButton pendingText="Diseñando tu ruta…">Reintentar generación de la ruta</SubmitButton>
          </form>
        </Card>
      )}
      <Card>
        <div className="flex items-center justify-between text-sm"><span>Estado del proyecto</span><span className="font-medium">{Math.round(Number(project.progress_pct))}%</span></div>
        <Progress value={Number(project.progress_pct)} className="mt-2" />
      </Card>

      <ol className="relative space-y-3 border-l pl-6" aria-label="Ruta de módulos">
        {rows.map((m) => {
          const unlocked = isUnlocked(lite.find((l) => l.id === m.id)!, lite);
          const deps = m.module_dependencies.map((d) => rows.find((r) => r.id === d.depends_on_module_id)?.position).filter(Boolean);
          const conceptsDone = m.module_concepts.filter((c) => c.status === "mastered" || c.status === "skipped_known").length;
          return (
            <li key={m.id} className="relative">
              <span className={`absolute -left-[31px] top-5 flex h-4 w-4 items-center justify-center rounded-full border-2 ${m.status === "completed" ? "border-success bg-success" : unlocked ? "border-primary bg-card" : "border-border bg-muted"}`} aria-hidden />
              <Card className={unlocked ? "" : "opacity-70"}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Módulo {m.position}{m.effort_estimate ? ` · ${m.effort_estimate}` : ""}</p>
                    <h2 className="font-medium">{m.title}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    {!unlocked && <Badge><Lock className="h-3 w-3" /> Requiere módulo {deps.join(", ")}</Badge>}
                    <ModuleStatusBadge status={m.status} />
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{m.technical_objective}</p>
                <p className="mt-2 text-sm"><strong>Entregable:</strong> {m.main_deliverable}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Conocimientos: {conceptsDone}/{m.module_concepts.length}</span>
                  {unlocked && <Link className="text-primary hover:underline" href={`/projects/${projectId}/modules/${m.id}`}>Abrir workspace →</Link>}
                </div>
              </Card>
            </li>
          );
        })}
      </ol>

      {allDone && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm"><Trophy className="h-4 w-4 text-warning" /> Completaste todos los módulos.</p>
          {portfolio ? (
            <Link className="text-sm text-primary underline" href={`/portfolio/${portfolio.id}`}>Ver portafolio</Link>
          ) : (
            <form action={completeProjectAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <SubmitButton pendingText="Generando portafolio…">Terminar proyecto y generar portafolio</SubmitButton>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
