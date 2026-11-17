import { NextResponse } from "next/server";
import { TutorRequest } from "@/domain/schemas";
import { createClient } from "@/lib/supabase/server";
import { runStream } from "@/server/ai/client";
import { PROMPTS, tutorSystem } from "@/server/ai/prompts";
import { AIError, userFacingAIMessage } from "@/server/ai/types";
import { untrusted } from "@/server/ai/untrusted";

export const maxDuration = 300;

/**
 * Tutor contextual con streaming. El contexto se construye SOLO con datos del
 * propio estudiante (RLS) y se persiste la conversación.
 */
export async function POST(req: Request) {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Configuración pendiente de Supabase." }, { status: 503 });
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const userId = auth.user.id;

  const parsed = TutorRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  const body = parsed.data;

  const [{ data: profile }, { data: mod }] = await Promise.all([
    supabase.from("user_profiles").select("tutor_help_level, preferred_language, prior_knowledge, program_name").eq("user_id", userId).maybeSingle(),
    supabase
      .from("challenge_modules")
      .select(
        "id, project_id, position, title, technical_objective, description, main_deliverable, acceptance_criteria, status, student_projects(title, challenge_versions(content)), module_concepts(id, status, why_needed, knowledge_concepts(name), concept_resources(rank, external_resources(title, canonical_url, resource_type)))",
      )
      .eq("id", body.moduleId)
      .eq("project_id", body.projectId)
      .maybeSingle(),
  ]);
  if (!mod) return NextResponse.json({ error: "Módulo no encontrado." }, { status: 404 });

  // Conversación: reutiliza la indicada o crea una nueva.
  let conversationId = body.conversationId;
  if (conversationId) {
    const { data: conv } = await supabase.from("tutor_conversations").select("id").eq("id", conversationId).eq("module_id", body.moduleId).maybeSingle();
    if (!conv) conversationId = undefined;
  }
  if (!conversationId) {
    const { data: conv, error } = await supabase
      .from("tutor_conversations")
      .insert({ user_id: userId, project_id: body.projectId, module_id: body.moduleId, module_concept_id: body.moduleConceptId ?? null, title: body.message.slice(0, 80) })
      .select("id")
      .single();
    if (error || !conv) return NextResponse.json({ error: "No se pudo iniciar la conversación." }, { status: 500 });
    conversationId = conv.id as string;
  }

  const { data: history } = await supabase
    .from("tutor_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(16);
  const { data: lastSubmission } = await supabase
    .from("submissions")
    .select("body, url, evidence_status, evaluations(summary, outcome, improvements)")
    .eq("module_id", body.moduleId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const helpLevel = body.helpLevel ?? profile?.tutor_help_level ?? 2;
  type C = { id: string; status: string; why_needed: string; knowledge_concepts: { name: string }; concept_resources: { rank: number; external_resources: { title: string; canonical_url: string; resource_type: string } }[] };
  const concepts = (mod.module_concepts as unknown as C[]).map((c) => ({
    concepto: c.knowledge_concepts.name,
    estado: c.status,
    por_que: c.why_needed,
    actual: c.id === body.moduleConceptId,
    recursos_verificados: c.concept_resources.sort((a, b) => a.rank - b.rank).map((r) => `${r.external_resources.title} (${r.external_resources.resource_type}) ${r.external_resources.canonical_url}`),
  }));
  const project = mod.student_projects as unknown as { title: string; challenge_versions: { content: { executive_summary?: string } } };
  const context = [
    JSON.stringify(
      {
        proyecto: project.title,
        resumen: project.challenge_versions.content.executive_summary,
        modulo: { posicion: mod.position, titulo: mod.title, objetivo: mod.technical_objective, entregable: mod.main_deliverable, criterios: mod.acceptance_criteria, estado: mod.status },
        conceptos: concepts,
        idioma: profile?.preferred_language ?? "es",
        programa: profile?.program_name,
      },
      null,
      1,
    ),
    profile?.prior_knowledge ? untrusted("student_prior_knowledge", profile.prior_knowledge, 1500) : "",
    lastSubmission ? untrusted("last_submission_and_feedback", JSON.stringify(lastSubmission), 6000) : "",
  ].join("\n");

  await supabase.from("tutor_messages").insert({ conversation_id: conversationId, user_id: userId, role: "user", content: body.message, help_level: helpLevel });

  const messages = [
    ...(history ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content as string })),
    { role: "user" as const, content: untrusted("student_message", body.message, 8000) },
  ];

  let stream;
  try {
    stream = await runStream({ userId, prompt: PROMPTS.tutor, system: tutorSystem(context, helpLevel), messages, effort: "medium", maxTokens: 6000 });
  } catch (err) {
    const status = err instanceof AIError && err.code === "rate_limited" ? 429 : err instanceof AIError && err.code === "config_missing" ? 503 : 502;
    return NextResponse.json({ error: userFacingAIMessage(err) }, { status });
  }

  const encoder = new TextEncoder();
  const cid = conversationId;
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      try {
        for await (const chunk of stream.chunks) {
          full += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        const msg = `\n\n_${userFacingAIMessage(err)}_`;
        full += msg;
        controller.enqueue(encoder.encode(msg));
      } finally {
        if (full.trim()) {
          await supabase.from("tutor_messages").insert({ conversation_id: cid, user_id: userId, role: "assistant", content: full.slice(0, 40000), help_level: helpLevel });
          await supabase.from("tutor_conversations").update({ updated_at: new Date().toISOString() }).eq("id", cid);
        }
        controller.close();
      }
    },
  });
  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Conversation-Id": cid },
  });
}
