import Link from "next/link";
import { ArrowRight, BookMarked, Briefcase, CheckCircle2, Clock, History } from "lucide-react";
import { Badge, Card, CardTitle, EmptyState, Progress } from "@/components/ui/primitives";
import { GoalForm } from "@/components/app/goal-form";
import { requireOnboardedUser } from "@/server/services/session";
import { MODULE_STATUS_LABEL, nextModule, type ModuleLite } from "@/domain/progress";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Inicio" };
export const maxDuration = 300;

const EVENT_LABEL: Record<string, string> = {
  project_started: "Iniciaste un proyecto",
  module_status_changed: "Avanzaste un módulo",
  concept_studied: "Estudiaste un concepto",
  concept_marked_known: "Marcaste un concepto como dominado",
  practice_attempted: "Intentaste una práctica",
  practice_passed: "Aprobaste una práctica",
  submission_created: "Entregaste evidencia",
  evaluation_received: "Recibiste una evaluación",
  module_completed: "Completaste un módulo",
  project_completed: "Completaste un proyecto",
  portfolio_generated: "Generaste tu portafolio",
};

export default async function Dashboard() {
  const { supabase, user, profile } = await requireOnboardedUser();
  const [projects, skills, saved, portfolio, history, goals] = await Promise.all([
    supabase
      .from("student_projects")
      .select("id, title, status, progress_pct, updated_at, challenge_modules(id, position, title, status, main_deliverable, module_dependencies!module_dependencies_module_id_fkey(depends_on_module_id))")
      .order("updated_at", { ascending: false }),
    supabase.from("user_skills").select("skill_name, source").eq("user_id", user.id).limit(60),
    supabase
      .from("concept_resources")
      .select("id, external_resources(title, canonical_url, resource_type)")
      .eq("saved", true)
      .limit(5),
    supabase.from("portfolio_items").select("id, project_id").eq("user_id", user.id),
    supabase.from("learning_progress").select("id, event_type, created_at").order("created_at", { ascending: false }).limit(8),
    supabase.from("learning_goals").select("id, raw_text, status, created_at").in("status", ["proposals_ready", "clarifying", "failed"]).order("created_at", { ascending: false }).limit(3),
  ]);

  type Mod = { id: string; position: number; title: string; status: ModuleLite["status"]; main_deliverable: string; module_dependencies: { depends_on_module_id: string }[] };
  const all = (projects.data ?? []) as unknown as { id: string; title: string; status: string; progress_pct: number; challenge_modules: Mod[] }[];
  const active = all.filter((p) => p.status === "active" || p.status === "planning" || p.status === "failed");
  const completed = all.filter((p) => p.status === "completed");
  const upcoming = active
    .map((p) => {
      const lite: ModuleLite[] = p.challenge_modules.map((m) => ({ id: m.id, position: m.position, status: m.status, dependsOn: m.module_dependencies.map((d) => d.depends_on_module_id) }));
      const n = nextModule(lite);
      const mod = n ? p.challenge_modules.find((m) => m.id === n.id) : undefined;
      return mod ? { project: p, mod } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const overall = active.length ? Math.round(active.reduce((s, p) => s + Number(p.progress_pct), 0) / active.length) : 0;
  const demonstrated = (skills.data ?? []).filter((s) => s.source === "demonstrated");
  const declared = (skills.data ?? []).filter((s) => s.source === "declared");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hola, {profile.full_name?.split(" ")[0] ?? "ingeniera/o"}</h1>
        <p className="text-sm text-muted-foreground">{profile.program_name} · {profile.institution_name}</p>
      </div>

      <Card className="p-6"><GoalForm compact /></Card>

      {(goals.data ?? []).length > 0 && (
        <Card>
          <CardTitle>Propuestas pendientes de decidir</CardTitle>
          <ul className="mt-3 space-y-2">
            {(goals.data ?? []).map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{g.raw_text}</span>
                <Link href={`/goals/${g.id}`} className="shrink-0 text-primary hover:underline">
                  {g.status === "failed" ? "Reintentar" : "Ver propuestas"}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <CardTitle>Retos activos</CardTitle>
            <span className="text-xs text-muted-foreground">Avance general {overall}%</span>
          </div>
          <div className="mt-4 space-y-4">
            {active.length === 0 && <EmptyState title="Aún no tienes retos activos">Escribe arriba qué quieres aprender o construir.</EmptyState>}
            {active.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="block rounded-lg border p-4 transition-colors hover:bg-muted">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{p.title}</p>
                  {p.status === "failed" ? <Badge tone="danger">Error al planificar</Badge> : <Badge tone="primary">{Math.round(Number(p.progress_pct))}%</Badge>}
                </div>
                <Progress value={Number(p.progress_pct)} className="mt-3" />
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" /> Próximos entregables</CardTitle>
          <ul className="mt-3 space-y-3">
            {upcoming.length === 0 && <li className="text-sm text-muted-foreground">Sin entregables pendientes.</li>}
            {upcoming.map(({ project, mod }) => (
              <li key={mod.id}>
                <Link href={`/projects/${project.id}/modules/${mod.id}`} className="group block">
                  <p className="text-sm font-medium group-hover:underline">{mod.main_deliverable}</p>
                  <p className="text-xs text-muted-foreground">Módulo {mod.position} · {MODULE_STATUS_LABEL[mod.status]} · {project.title}</p>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Competencias</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Demostradas con evidencia evaluada. No son certificaciones oficiales.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {demonstrated.length === 0 && <span className="text-sm text-muted-foreground">Aún ninguna demostrada.</span>}
            {demonstrated.map((s) => <Badge key={s.skill_name} tone="success">{s.skill_name}</Badge>)}
          </div>
          {declared.length > 0 && (
            <>
              <p className="mt-4 text-xs text-muted-foreground">Declaradas por ti</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{declared.map((s) => <Badge key={s.skill_name}>{s.skill_name}</Badge>)}</div>
            </>
          )}
        </Card>

        <Card>
          <CardTitle className="flex items-center gap-2"><Briefcase className="h-4 w-4" /> Proyectos completados y portafolio</CardTitle>
          <ul className="mt-3 space-y-2 text-sm">
            {completed.length === 0 && <li className="text-muted-foreground">Aún no completas proyectos.</li>}
            {completed.map((p) => {
              const item = (portfolio.data ?? []).find((i) => i.project_id === p.id);
              return (
                <li key={p.id} className="flex justify-between gap-2">
                  <span className="truncate">{p.title}</span>
                  {item ? <Link className="text-primary hover:underline" href={`/portfolio/${item.id}`}>Portafolio</Link> : <Link className="text-primary hover:underline" href={`/projects/${p.id}`}>Ver</Link>}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardTitle className="flex items-center gap-2"><BookMarked className="h-4 w-4" /> Recursos guardados</CardTitle>
          <ul className="mt-3 space-y-2 text-sm">
            {(saved.data ?? []).length === 0 && <li className="text-muted-foreground">Guarda recursos desde tus tarjetas de conocimiento.</li>}
            {(saved.data ?? []).map((r) => {
              const res = r.external_resources as unknown as { title: string; canonical_url: string };
              return (
                <li key={r.id}>
                  <a className="line-clamp-1 hover:underline" href={res.canonical_url} target="_blank" rel="noopener noreferrer">{res.title}</a>
                </li>
              );
            })}
          </ul>
          <Link href="/resources" className="mt-3 inline-flex items-center gap-1 text-xs text-primary">Explorador de recursos <ArrowRight className="h-3 w-3" /></Link>
        </Card>

        <Card className="lg:col-span-3">
          <CardTitle className="flex items-center gap-2"><History className="h-4 w-4" /> Historial de aprendizaje</CardTitle>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {(history.data ?? []).length === 0 && <li className="text-sm text-muted-foreground">Tu actividad aparecerá aquí.</li>}
            {(history.data ?? []).map((h) => (
              <li key={h.id} className="flex justify-between text-sm">
                <span>{EVENT_LABEL[h.event_type] ?? h.event_type}</span>
                <span className="text-xs text-muted-foreground">{formatDate(h.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
