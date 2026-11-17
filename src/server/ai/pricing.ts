/**
 * Precios por millón de tokens (USD). Solo incluimos modelos cuyo precio fue
 * verificado en documentación oficial; para el resto el costo se registra como
 * `null` (desconocido) en lugar de inventarlo. Se puede sobrescribir con AI_PRICING_JSON.
 */
export interface ModelPrice {
  input: number;
  output: number;
  cachedInput?: number;
}

// Fuente: tabla de modelos de Anthropic (claude-api skill, cache 2026-11-03).
const BUILTIN: Record<string, ModelPrice> = {
  "claude-opus-5-5": { input: 4, output: 20, cachedInput: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cachedInput: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

export function parsePricingOverrides(json: string | undefined): Record<string, ModelPrice> {
  if (!json) return {};
  try {
    const raw = JSON.parse(json) as unknown;
    if (!raw || typeof raw !== "object") return {};
    const out: Record<string, ModelPrice> = {};
    for (const [model, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v && typeof v === "object") {
        const { input, output, cachedInput } = v as Record<string, unknown>;
        if (typeof input === "number" && typeof output === "number") {
          out[model] = { input, output, ...(typeof cachedInput === "number" ? { cachedInput } : {}) };
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function estimateCostUsd(
  model: string,
  usage: { inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null },
  overrides: Record<string, ModelPrice> = {},
): number | null {
  const price = overrides[model] ?? BUILTIN[model];
  if (!price || usage.inputTokens == null || usage.outputTokens == null) return null;
  const cached = usage.cachedInputTokens ?? 0;
  const uncached = Math.max(0, usage.inputTokens - cached);
  const cost =
    (uncached * price.input + cached * (price.cachedInput ?? price.input) + usage.outputTokens * price.output) / 1_000_000;
  return Math.round(cost * 1e6) / 1e6;
}
