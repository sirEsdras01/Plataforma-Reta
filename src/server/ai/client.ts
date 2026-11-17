import "server-only";
import { env } from "@/server/env";
import { createAdminClient } from "@/lib/supabase/server";
import { AnthropicProvider } from "./providers/anthropic";
import { GeminiProvider } from "./providers/gemini";
import { estimateCostUsd, parsePricingOverrides } from "./pricing";
import type { ChatMessage, Effort, LLMProvider, TextStream, TokenUsage } from "./types";
import { AIError } from "./types";
import type { z } from "zod";

let provider: LLMProvider | undefined;

/** Proveedor configurado por variables de entorno. Lanza `config_missing` si faltan claves. */
export function getProvider(): LLMProvider {
  if (provider) return provider;
  const e = env();
  if (e.AI_PROVIDER === "anthropic") {
    if (!e.ANTHROPIC_API_KEY) throw new AIError("config_missing", "ANTHROPIC_API_KEY is not set.");
    provider = new AnthropicProvider({
      apiKey: e.ANTHROPIC_API_KEY,
      model: e.ANTHROPIC_MODEL,
      timeoutMs: e.AI_TIMEOUT_MS,
      maxRetries: e.AI_MAX_RETRIES,
      serverFallbacks: e.ANTHROPIC_SERVER_FALLBACKS,
    });
  } else {
    if (!e.GEMINI_API_KEY) throw new AIError("config_missing", "GEMINI_API_KEY is not set.");
    provider = new GeminiProvider({ apiKey: e.GEMINI_API_KEY, model: e.GEMINI_MODEL, timeoutMs: e.AI_TIMEOUT_MS });
  }
  return provider;
}

export function isAIConfigured(): boolean {
  const e = env();
  return e.AI_PROVIDER === "anthropic" ? !!e.ANTHROPIC_API_KEY : !!e.GEMINI_API_KEY;
}

/** Solo para pruebas. */
export function setProviderForTests(p: LLMProvider | undefined) {
  provider = p;
}

export interface PromptSpec {
  id: string; // operación: 'challenge_designer', 'tutor', ...
  version: string; // versión del prompt, p.ej. 'challenge_designer@2026-11-17.1'
}

interface UsageLog {
  userId: string | null;
  prompt: PromptSpec;
  provider: string;
  model: string;
  usage: TokenUsage | null;
  latencyMs: number;
  status: "ok" | "error" | "validation_error" | "rate_limited" | "refused";
  errorCode?: string;
}

async function logUsage(l: UsageLog) {
  try {
    const e = env();
    const usage = l.usage ?? { inputTokens: null, outputTokens: null, cachedInputTokens: null };
    await createAdminClient()
      .from("ai_usage_logs")
      .insert({
        user_id: l.userId,
        operation: l.prompt.id,
        provider: l.provider,
        model: l.model,
        prompt_version: l.prompt.version,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cached_input_tokens: usage.cachedInputTokens,
        estimated_cost_usd: estimateCostUsd(l.model, usage, parsePricingOverrides(e.AI_PRICING_JSON)),
        latency_ms: l.latencyMs,
        status: l.status,
        error_code: l.errorCode ?? null,
      });
  } catch (err) {
    // El registro de uso nunca debe tumbar la operación principal.
    console.error("[ai] failed to log usage", err);
  }
}

/** Límite por usuario: N solicitudes de IA por hora (ventana deslizante sobre ai_usage_logs). */
export async function assertWithinRateLimit(userId: string) {
  const limit = env().AI_HOURLY_REQUEST_LIMIT;
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await createAdminClient()
    .from("ai_usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if (error) {
    console.error("[ai] rate limit check failed", error);
    return; // fail-open en el conteo; el proveedor tiene sus propios límites
  }
  if ((count ?? 0) >= limit) throw new AIError("rate_limited", `Hourly limit of ${limit} reached.`);
}

function statusOf(err: unknown): UsageLog["status"] {
  if (err instanceof AIError) {
    if (err.code === "validation_failed") return "validation_error";
    if (err.code === "rate_limited") return "rate_limited";
    if (err.code === "refused") return "refused";
  }
  return "error";
}

export interface RunStructuredParams<T> {
  userId: string;
  prompt: PromptSpec;
  system: string;
  messages: ChatMessage[];
  schema: z.ZodType<T>;
  schemaName: string;
  effort?: Effort;
  maxTokens?: number;
  /** Validación semántica adicional; devuelve mensaje de error o null. */
  validate?: (data: T) => string | null;
}

/**
 * Ejecuta una llamada estructurada con: límite por usuario, timeout, un
 * reintento acotado si la salida no valida, y registro de tokens/costo.
 */
export async function runStructured<T>(p: RunStructuredParams<T>): Promise<T> {
  await assertWithinRateLimit(p.userId);
  const llm = getProvider();
  const e = env();
  const maxAttempts = 2;
  let lastErr: unknown;
  let messages = p.messages;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), e.AI_TIMEOUT_MS);
    try {
      const res = await llm.generateObject({
        system: p.system,
        messages,
        schema: p.schema,
        schemaName: p.schemaName,
        effort: p.effort ?? "medium",
        maxTokens: p.maxTokens ?? 16000,
        signal: controller.signal,
      });
      const semanticError = p.validate?.(res.data) ?? null;
      if (semanticError) {
        await logUsage({ userId: p.userId, prompt: p.prompt, provider: llm.id, model: res.model, usage: res.usage, latencyMs: Date.now() - started, status: "validation_error", errorCode: "semantic" });
        lastErr = new AIError("validation_failed", semanticError, true);
        messages = [
          ...p.messages,
          { role: "assistant", content: JSON.stringify(res.data).slice(0, 20000) },
          { role: "user", content: `La respuesta anterior no cumple una regla: ${semanticError}. Corrígela y devuelve el objeto completo.` },
        ];
        continue;
      }
      await logUsage({ userId: p.userId, prompt: p.prompt, provider: llm.id, model: res.model, usage: res.usage, latencyMs: Date.now() - started, status: "ok" });
      return res.data;
    } catch (err) {
      lastErr = err;
      await logUsage({ userId: p.userId, prompt: p.prompt, provider: llm.id, model: llm.model, usage: null, latencyMs: Date.now() - started, status: statusOf(err), errorCode: err instanceof AIError ? err.code : "unknown" });
      const retryable = err instanceof AIError && err.code === "validation_failed";
      if (!retryable) throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new AIError("validation_failed", "Validation failed after retries.");
}

export interface RunStreamParams {
  userId: string;
  prompt: PromptSpec;
  system: string;
  messages: ChatMessage[];
  effort?: Effort;
  maxTokens?: number;
}

/** Stream de texto con límite por usuario y registro de uso al terminar. */
export async function runStream(p: RunStreamParams): Promise<TextStream> {
  await assertWithinRateLimit(p.userId);
  const llm = getProvider();
  const started = Date.now();
  const stream = llm.streamText({ system: p.system, messages: p.messages, effort: p.effort ?? "medium", maxTokens: p.maxTokens ?? 8000 });
  stream.done
    .then((d) => logUsage({ userId: p.userId, prompt: p.prompt, provider: llm.id, model: d.model, usage: d.usage, latencyMs: Date.now() - started, status: "ok" }))
    .catch((err) => logUsage({ userId: p.userId, prompt: p.prompt, provider: llm.id, model: llm.model, usage: null, latencyMs: Date.now() - started, status: statusOf(err), errorCode: err instanceof AIError ? err.code : "unknown" }));
  return stream;
}
