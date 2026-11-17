import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { portfolioToReadme } from "@/domain/portfolio";
import type { PortfolioContent } from "@/domain/schemas";
import { loadPortfolioEvidence } from "@/server/services/portfolio";

export async function GET(_req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  if (!z.string().uuid().safeParse(itemId).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { data: item } = await supabase.from("portfolio_items").select("content, project_id, slug").eq("id", itemId).eq("user_id", auth.user.id).maybeSingle();
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const md = portfolioToReadme(item.content as PortfolioContent, await loadPortfolioEvidence(supabase, item.project_id as string));
  return new Response(md, {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="README-${item.slug}.md"` },
  });
}
