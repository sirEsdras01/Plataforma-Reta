import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PortfolioView } from "@/components/app/portfolio-view";
import { Card } from "@/components/ui/primitives";
import type { PortfolioContent } from "@/domain/schemas";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { APP_NAME } from "@/lib/brand";

async function load(slug: string) {
  if (!isSupabaseConfigured() || !/^[a-z0-9-]{3,80}$/.test(slug)) return null;
  const supabase = await createClient();
  // RLS: anónimos solo leen elementos con visibility = 'public'.
  const { data } = await supabase.from("portfolio_items").select("content, visibility").eq("slug", slug).eq("visibility", "public").maybeSingle();
  return data ? (data.content as PortfolioContent) : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await load((await params).slug);
  return c ? { title: c.title, description: c.executive_summary.slice(0, 160) } : { title: "No encontrado" };
}

/** Página pública opcional. Muestra solo el contenido editable del portafolio (sin datos privados de evidencias). */
export default async function PublicPortfolio({ params }: { params: Promise<{ slug: string }> }) {
  const c = await load((await params).slug);
  if (!c) notFound();
  return (
    <main className="mx-auto max-w-4xl p-6 py-12">
      <Card className="p-8"><PortfolioView c={c} evidences={[]} /></Card>
      <p className="mt-6 text-center text-xs text-muted-foreground">Proyecto desarrollado en {APP_NAME}</p>
    </main>
  );
}
