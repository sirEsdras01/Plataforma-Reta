import "server-only";
import { ApiError, GoogleGenAI, type Content } from "@google/genai";
import { z } from "zod";
import type {
  ChatMessage,
  EmbeddingProvider,
  GenerateObjectParams,
  GenerateObjectResult,
  LLMProvider,
  StreamTextParams,
  TextStream,
  TokenUsage,
} from "../types";
import { AIError } from "../types";

interface GeminiConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

function toContents(messages: ChatMessage[]): Content[] {
  return messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
}

function usageOf(u: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number } | undefined): TokenUsage {
  if (!u) return { inputTokens: null, outputTokens: null, cachedInputTokens: null };
  return {
    inputTokens: u.promptTokenCount ?? null,
    // Los tokens de razonamiento se facturan como salida.
    outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
    cachedInputTokens: u.cachedContentTokenCount ?? null,
  };
}

/**
 * Adaptador de Gemini (SDK oficial @google/genai).
 * Salida estructurada con `responseMimeType: application/json` + `responseJsonSchema`
 * generado desde el mismo esquema Zod, y validación posterior con Zod.
 */
export class GeminiProvider implements LLMProvider {
  readonly id = "gemini" as const;
  readonly model: string;
  private ai: GoogleGenAI;
  private timeoutMs: number;

  constructor(cfg: GeminiConfig) {
    this.model = cfg.model;
    this.timeoutMs = cfg.timeoutMs;
    this.ai = new GoogleGenAI({ apiKey: cfg.apiKey });
  }

  async generateObject<T>(p: GenerateObjectParams<T>): Promise<GenerateObjectResult<T>> {
    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: toContents(p.messages),
        config: {
          systemInstruction: p.system,
          maxOutputTokens: p.maxTokens,
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(p.schema, { target: "draft-2020-12" }),
          abortSignal: p.signal,
          httpOptions: { timeout: this.timeoutMs },
        },
      });
      const text = response.text;
      if (!text) {
        const reason = response.candidates?.[0]?.finishReason;
        if (reason === "SAFETY" || reason === "PROHIBITED_CONTENT") throw new AIError("refused", "Gemini blocked the response.");
        throw new AIError("validation_failed", `Empty response (${reason ?? "unknown"}).`, true);
      }
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch (e) {
        throw new AIError("validation_failed", "Gemini returned invalid JSON.", true, { cause: e });
      }
      const parsed = p.schema.safeParse(json);
      if (!parsed.success) {
        throw new AIError("validation_failed", `Schema validation failed: ${parsed.error.message.slice(0, 500)}`, true);
      }
      return { data: parsed.data, usage: usageOf(response.usageMetadata), model: this.model };
    } catch (err) {
      throw mapGeminiError(err);
    }
  }

  streamText(p: StreamTextParams): TextStream {
    const ai = this.ai;
    const model = this.model;
    const timeout = this.timeoutMs;
    let resolveDone!: (v: { usage: TokenUsage; model: string; text: string }) => void;
    let rejectDone!: (e: unknown) => void;
    const done = new Promise<{ usage: TokenUsage; model: string; text: string }>((res, rej) => {
      resolveDone = res;
      rejectDone = rej;
    });
    done.catch(() => undefined);

    async function* chunks(): AsyncGenerator<string> {
      let text = "";
      let usage: TokenUsage = { inputTokens: null, outputTokens: null, cachedInputTokens: null };
      try {
        const stream = await ai.models.generateContentStream({
          model,
          contents: toContents(p.messages),
          config: {
            systemInstruction: p.system,
            maxOutputTokens: p.maxTokens,
            abortSignal: p.signal,
            httpOptions: { timeout },
          },
        });
        for await (const chunk of stream) {
          if (chunk.usageMetadata) usage = usageOf(chunk.usageMetadata);
          const t = chunk.text;
          if (t) {
            text += t;
            yield t;
          }
        }
        resolveDone({ usage, model, text });
      } catch (err) {
        const mapped = mapGeminiError(err);
        rejectDone(mapped);
        throw mapped;
      }
    }
    return { chunks: chunks(), done };
  }
}

export class GeminiEmbeddings implements EmbeddingProvider {
  readonly id = "gemini";
  readonly dimensions = 768; // coincide con vector(768) en la base de datos
  private ai: GoogleGenAI;
  constructor(apiKey: string, readonly model: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }
  async embed(texts: string[], kind: "document" | "query"): Promise<number[][]> {
    const res = await this.ai.models.embedContent({
      model: this.model,
      contents: texts,
      config: {
        outputDimensionality: this.dimensions,
        // taskType solo es aceptado por gemini-embedding-001 (ver INTEGRATIONS.md)
        ...(this.model === "gemini-embedding-001"
          ? { taskType: kind === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT" }
          : {}),
      },
    });
    return (res.embeddings ?? []).map((e) => e.values ?? []);
  }
}

function mapGeminiError(err: unknown): AIError {
  if (err instanceof AIError) return err;
  if (err instanceof ApiError) {
    if (err.status === 429) return new AIError("rate_limited", "Gemini rate limit.", true, { cause: err });
    if (err.status === 401 || err.status === 403) return new AIError("config_missing", "Invalid Gemini API key.", false, { cause: err });
    return new AIError("provider_error", `Gemini API error ${err.status}`, err.status >= 500, { cause: err });
  }
  if (err instanceof Error && err.name === "AbortError") return new AIError("timeout", "Gemini timeout.", true, { cause: err });
  return new AIError("provider_error", "Unknown Gemini error.", false, { cause: err });
}
