import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { ResourceCard, type ResourceView } from "@/components/app/resource-card";
import { requireOnboardedUser } from "@/server/services/session";

export const metadata = { title: "Recursos" };

/** Explorador de recursos: todo lo recomendado al estudiante, siempre ligado a la necesidad del proyecto que lo originó. */
export default async function ResourcesPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const { supabase } = await requireOnboardedUser();
  let q = supabase
    .from("concept_resources")
    .select("id, rank, reason, confidence, saved, created_at, module_concepts(id, module_id, knowledge_concepts(name), challenge_modules(title, project_id)), resource:external_resources(id, provider_id, external_id, canonical_url, title, authors, organization, published_at, resource_type, license, is_open_access, peer_reviewed, duration_seconds, doi, metadata, provenance, resource_segments(id, label, start_seconds, end_seconds, verification, verification_source))")
    .order("created_at", { ascending: false })
    .limit(60);
  if (saved === "1") q = q.eq("saved", true);
  const { data } = await q;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Explorador de recursos"
        description="Cada recurso responde a una necesidad concreta de tus proyectos y muestra su procedencia verificable."
        actions={
          <div className="flex gap-2 text-sm">
            <Link className={saved === "1" ? "text-muted-foreground" : "font-medium"} href="/resources">Todos</Link>
            <Link className={saved === "1" ? "font-medium" : "text-muted-foreground"} href="/resources?saved=1">Guardados</Link>
          </div>
        }
      />
      <div className="space-y-4">
        {(data ?? []).length === 0 && <EmptyState title="Sin recursos aún">Abre un concepto en un módulo y pulsa “Aprender ahora”.</EmptyState>}
        {(data ?? []).map((r) => {
          const mc = r.module_concepts as unknown as { id: string; module_id: string; knowledge_concepts: { name: string }; challenge_modules: { title: string; project_id: string } };
          return (
            <Card key={r.id} className="p-3">
              <p className="mb-2 px-1 text-xs text-muted-foreground">
                Para <Link className="underline" href={`/projects/${mc.challenge_modules.project_id}/modules/${mc.module_id}/concepts/${mc.id}`}>{mc.knowledge_concepts.name}</Link> · {mc.challenge_modules.title}
              </p>
              <ResourceCard r={r as unknown as ResourceView} path={`/resources${saved === "1" ? "?saved=1" : ""}`} embed={false} />
            </Card>
          );
        })}
      </div>
    </div>
  );
}
