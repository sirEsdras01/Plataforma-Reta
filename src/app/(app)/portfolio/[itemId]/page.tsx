import { notFound } from "next/navigation";
import { Download, Globe, Lock } from "lucide-react";
import { Alert, Card, Input, Label, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/submit-button";
import { PortfolioView } from "@/components/app/portfolio-view";
import { PrintButton } from "@/components/app/print-button";
import type { PortfolioContent } from "@/domain/schemas";
import { env } from "@/server/env";
import { loadPortfolioEvidence } from "@/server/services/portfolio";
import { requireOnboardedUser } from "@/server/services/session";
import { setPortfolioVisibilityAction, updatePortfolioAction } from "../../actions";

export const metadata = { title: "Proyecto de portafolio" };

export default async function PortfolioItemPage({ params, searchParams }: { params: Promise<{ itemId: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { itemId } = await params;
  const { error, saved } = await searchParams;
  const { supabase, user, profile } = await requireOnboardedUser();
  const { data: item } = await supabase.from("portfolio_items").select("*").eq("id", itemId).eq("user_id", user.id).maybeSingle();
  if (!item) notFound();
  const c = item.content as PortfolioContent;
  const evidences = await loadPortfolioEvidence(supabase, item.project_id as string);
  const publicUrl = `${env().NEXT_PUBLIC_SITE_URL ?? ""}/p/${item.slug}`;
  const field = (name: keyof PortfolioContent, label: string, multiline: "text" | "list" | "line" = "text") => {
    const v = c[name];
    const value = Array.isArray(v) ? v.join("\n") : (v as string);
    return (
      <div>
        <Label htmlFor={name}>{label}{multiline === "list" ? " (uno por línea)" : ""}</Label>
        {multiline === "line" ? <Input id={name} name={name} defaultValue={value} /> : <Textarea id={name} name={name} defaultValue={value} rows={multiline === "list" ? 4 : 3} />}
      </div>
    );
  };
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}
      {saved && <Alert tone="success">Cambios guardados.</Alert>}
      <Card className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {item.visibility === "public" ? (
            <span className="flex items-center gap-1.5"><Globe className="h-4 w-4 text-success" /> Público en <a className="underline" href={`/p/${item.slug}`} target="_blank" rel="noopener noreferrer">{publicUrl}</a></span>
          ) : (
            <span className="flex items-center gap-1.5"><Lock className="h-4 w-4" /> Privado (solo tú lo ves)</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={setPortfolioVisibilityAction}>
            <input type="hidden" name="id" value={itemId} />
            <input type="hidden" name="visibility" value={item.visibility === "public" ? "private" : "public"} />
            <SubmitButton variant="outline" size="sm">{item.visibility === "public" ? "Hacer privado" : "Publicar enlace"}</SubmitButton>
          </form>
          <a href={`/api/portfolio/${itemId}/readme`} className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted"><Download className="h-4 w-4" /> README.md</a>
          <PrintButton />
        </div>
      </Card>
      <Card className="p-8"><PortfolioView c={c} evidences={evidences} author={profile.full_name} /></Card>
      <Card className="no-print">
        <details>
          <summary className="cursor-pointer text-sm font-medium">Editar presentación</summary>
          <form action={updatePortfolioAction} className="mt-4 grid gap-4">
            <input type="hidden" name="id" value={itemId} />
            {field("title", "Título", "line")}
            {field("executive_summary", "Resumen ejecutivo")}
            {field("problem", "Problema")}
            {field("objectives", "Objetivos", "list")}
            {field("methodology", "Metodología")}
            {field("architecture", "Arquitectura")}
            {field("technologies", "Tecnologías", "list")}
            {field("results", "Resultados")}
            {field("metrics", "Métricas", "list")}
            {field("limitations", "Limitaciones", "list")}
            {field("learnings", "Aprendizajes", "list")}
            {field("competencies", "Competencias", "list")}
            {field("repository_url", "URL del repositorio (https)", "line")}
            {field("demo_url", "URL de la demostración (https)", "line")}
            <div className="flex justify-end"><SubmitButton>Guardar cambios</SubmitButton></div>
          </form>
        </details>
      </Card>
    </div>
  );
}
