import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type {
  GenerateObjectParams,
  GenerateObjectResult,
  LLMProvider,
  StreamTextParams,
  TextStream,
  TokenUsage,
} from "../types";
import { AIError } from "../types";

interface AnthropicConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  serverFallbacks: "default" | "off";
}

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * Adaptador de Claude (Anthropic Messages API vía SDK oficial).
 * - Salidas estructuradas con `output_config.format` + Zod (`messages.parse`).
 * - Esfuerzo vía `output_config.effort`. En claude-opus-5-5 el razonamiento adaptativo
 *   está siempre activo y no se configura `thinking`.
 * - Fallback del lado del servidor ante rechazos de política (opt-in configurable).
 */
export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic" as const;
  readonly model: string;
  private client: Anthropic;
  private fallbacks: "default" | "off";

  constructor(cfg: AnthropicConfig) {
    this.model = cfg.model;
    this.fallbacks = cfg.serverFallbacks;
    this.client = new Anthropic({ apiKey: cfg.apiKey, timeout: cfg.timeoutMs, maxRetries: cfg.maxRetries });
  }

  private fallbackParams(): { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks?: "default" } {
    return this.fallbacks === "default" ? { betas: [FALLBACK_BETA], fallbacks: "default" } : { betas: [] };
  }

  async generateObject<T>(p: GenerateObjectParams<T>): Promise<GenerateObjectResult<T>> {
    try {
      const response = await this.client.beta.messages.parse(
        {
          model: this.model,
          max_tokens: p.maxTokens,
          system: p.system,
          messages: p.messages,
          output_config: {
            effort: p.effort,
            // El helper genera el JSON Schema y valida la respuesta con el mismo esquema Zod.
            format: betaZodOutputFormat(p.schema as never),
          },
          ...this.fallbackParams(),
        },
        { signal: p.signal },
      );

      if (response.stop_reason === "refusal") {
        throw new AIError("refused", "The model declined the request.");
      }
      if (response.stop_reason === "max_tokens") {
        throw new AIError("validation_failed", "Output truncated by max_tokens.", true);
      }
      const parsed = response.parsed_output as T | null | undefined;
      if (parsed == null) {
        throw new AIError("validation_failed", "Structured output could not be parsed.", true);
      }
      return { data: parsed, usage: usageOf(response.usage), model: response.model };
    } catch (err) {
      throw mapAnthropicError(err);
    }
  }

  streamText(p: StreamTextParams): TextStream {
    const stream = this.client.beta.messages.stream(
      {
        model: this.model,
        max_tokens: p.maxTokens,
        system: p.system,
        messages: p.messages,
        output_config: { effort: p.effort },
        ...this.fallbackParams(),
      },
      { signal: p.signal },
    );

    let resolveDone!: (v: { usage: TokenUsage; model: string; text: string }) => void;
    let rejectDone!: (e: unknown) => void;
    const done = new Promise<{ usage: TokenUsage; model: string; text: string }>((res, rej) => {
      resolveDone = res;
      rejectDone = rej;
    });
    // Evita "unhandled rejection" si el consumidor no espera `done`.
    done.catch(() => undefined);

    async function* chunks(): AsyncGenerator<string> {
      let text = "";
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            text += event.delta.text;
            yield event.delta.text;
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") throw new AIError("refused", "The model declined the request.");
        resolveDone({ usage: usageOf(final.usage), model: final.model, text });
      } catch (err) {
        const mapped = mapAnthropicError(err);
        rejectDone(mapped);
        throw mapped;
      }
    }

    return { chunks: chunks(), done };
  }
}

function usageOf(u: {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}): TokenUsage {
  return {
    inputTokens: u.input_tokens ?? null,
    outputTokens: u.output_tokens ?? null,
    cachedInputTokens: u.cache_read_input_tokens ?? null,
  };
}

function mapAnthropicError(err: unknown): AIError {
  if (err instanceof AIError) return err;
  if (err instanceof Anthropic.RateLimitError) return new AIError("rate_limited", "Provider rate limit.", true, { cause: err });
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new AIError("timeout", "Provider timeout.", true, { cause: err });
  if (err instanceof Anthropic.AuthenticationError) return new AIError("config_missing", "Invalid Anthropic API key.", false, { cause: err });
  if (err instanceof Anthropic.APIUserAbortError) return new AIError("timeout", "Request aborted.", true, { cause: err });
  if (err instanceof Anthropic.APIError) return new AIError("provider_error", `Anthropic API error ${err.status ?? ""}`, true, { cause: err });
  if (err instanceof Error && /parse|schema|zod/i.test(err.message)) {
    return new AIError("validation_failed", err.message, true, { cause: err });
  }
  return new AIError("provider_error", "Unknown provider error.", false, { cause: err });
}
