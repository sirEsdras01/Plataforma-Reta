import type { z } from "zod";

export type ProviderId = "anthropic" | "gemini";
export type Effort = "low" | "medium" | "high";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
}

export interface GenerateObjectParams<T> {
  system: string;
  messages: ChatMessage[];
  schema: z.ZodType<T>;
  schemaName: string;
  effort: Effort;
  maxTokens: number;
  signal?: AbortSignal;
}

export interface GenerateObjectResult<T> {
  data: T;
  usage: TokenUsage;
  model: string;
}

export interface StreamTextParams {
  system: string;
  messages: ChatMessage[];
  effort: Effort;
  maxTokens: number;
  signal?: AbortSignal;
}

export interface TextStream {
  /** Fragmentos de texto en orden de llegada. */
  chunks: AsyncIterable<string>;
  /** Se resuelve cuando termina el stream. */
  done: Promise<{ usage: TokenUsage; model: string; text: string }>;
}

/**
 * Interfaz uniforme de proveedor de modelos. El resto del sistema nunca importa
 * un SDK de proveedor directamente: solo esta interfaz.
 */
export interface LLMProvider {
  readonly id: ProviderId;
  readonly model: string;
  generateObject<T>(params: GenerateObjectParams<T>): Promise<GenerateObjectResult<T>>;
  streamText(params: StreamTextParams): TextStream;
}

export interface EmbeddingProvider {
  readonly id: string;
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[], kind: "document" | "query"): Promise<number[][]>;
}

// ---------------------------------------------------------------------------
// Errores tipados
// ---------------------------------------------------------------------------
export type AIErrorCode =
  | "config_missing"
  | "rate_limited"
  | "refused"
  | "validation_failed"
  | "timeout"
  | "provider_error";

export class AIError extends Error {
  constructor(
    public readonly code: AIErrorCode,
    message: string,
    public readonly retryable = false,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AIError";
  }
}

/** Mensaje seguro para el usuario final (sin detalles internos). */
export function userFacingAIMessage(err: unknown): string {
  if (err instanceof AIError) {
    switch (err.code) {
      case "config_missing":
        return "La IA aún no está configurada en este entorno (configuración pendiente). Revisa SETUP.md.";
      case "rate_limited":
        return "Alcanzaste el límite de solicitudes de IA por hora. Intenta de nuevo más tarde.";
      case "refused":
        return "El modelo no pudo responder a esta solicitud. Reformúlala e inténtalo de nuevo.";
      case "validation_failed":
        return "La respuesta de la IA no tuvo el formato esperado. Inténtalo de nuevo.";
      case "timeout":
        return "La IA tardó demasiado en responder. Inténtalo de nuevo.";
      default:
        return "El proveedor de IA devolvió un error. Inténtalo de nuevo en unos minutos.";
    }
  }
  return "Ocurrió un error inesperado.";
}
