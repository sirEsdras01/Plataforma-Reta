import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireOnboardedUser } from "@/server/services/session";

export const metadata = { title: "Portafolio" };

export default async function PortfolioList() {
  const { supabase, user } = await requireOnboardedUser();
  const { data } = await supabase.from("portfolio_items").select("id, slug, visibility, content, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Portafolio profesional" description="Proyectos terminados, listos para empleadores e investigadores. Privados por defecto." />
      <div className="space-y-3">
        {(data ?? []).length === 0 && <EmptyState title="Aún no hay proyectos en tu portafolio">Termina todos los módulos de un reto para generarlo.</EmptyState>}
        {(data ?? []).map((i) => (
          <Link key={i.id} href={`/portfolio/${i.id}`}>
            <Card className="hover:bg-muted">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{(i.content as { title: string }).title}</p>
                <Badge tone={i.visibility === "public" ? "success" : "neutral"}>{i.visibility === "public" ? "Público" : "Privado"}</Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{(i.content as { executive_summary: string }).executive_summary}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
