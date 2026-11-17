import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, Progress } from "@/components/ui/primitives";
import { requireOnboardedUser } from "@/server/services/session";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Proyectos" };

const STATUS: Record<string, string> = { planning: "Planificando", active: "Activo", completed: "Completado", paused: "En pausa", abandoned: "Abandonado", failed: "Error al planificar" };

export default async function ProjectsPage() {
  const { supabase } = await requireOnboardedUser();
  const { data } = await supabase.from("student_projects").select("id, title, status, progress_pct, started_at").order("updated_at", { ascending: false });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Proyectos" description="Tus retos aceptados. Retoma donde te quedaste." />
      <div className="space-y-3">
        {(data ?? []).length === 0 && <EmptyState title="Sin proyectos todavía"><Link className="underline" href="/challenges/new">Crea tu primer reto</Link></EmptyState>}
        {(data ?? []).map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`}>
            <Card className="transition-colors hover:bg-muted">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{p.title}</p>
                <Badge tone={p.status === "completed" ? "success" : p.status === "failed" ? "danger" : "primary"}>{STATUS[p.status] ?? p.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Iniciado {formatDate(p.started_at)}</p>
              <Progress value={Number(p.progress_pct)} className="mt-3" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
