import "server-only";
import { cacheKey, getCached, setCached } from "../integrations/cache";
import { getProviders } from "../integrations/registry";
import { ProviderError, type NormalizedResource, type ProviderKey } from "../integrations/types";

export interface ProviderRunReport {
  provider: ProviderKey;
  query: string;
  status: "ok" | "cached" | "not_configured" | "error";
  count: number;
  error?: string;
}

/**
 * Ejecuta las consultas del plan de búsqueda en paralelo contra los proveedores,
 * con caché y aislamiento de errores (un proveedor caído no rompe la recomendación).
 */
export async function multiProviderSearch(
  queries: { provider: ProviderKey; query: string }[],
  opts: { language?: string; perQuery?: number; timeoutMs?: number } = {},
): Promise<{ results: NormalizedResource[]; report: ProviderRunReport[] }> {
  const providers = getProviders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  const perQuery = opts.perQuery ?? 6;

  try {
    const runs = await Promise.all(
      queries.map(async ({ provider, query }): Promise<{ items: NormalizedResource[]; report: ProviderRunReport }> => {
        const p = providers[provider];
        if (!p.isConfigured()) return { items: [], report: { provider, query, status: "not_configured", count: 0 } };
        const lang = provider === "youtube" ? opts.language : undefined;
        const key = cacheKey(provider, query, perQuery, lang);
        try {
          const cached = await getCached(key).catch(() => null);
          if (cached) return { items: cached, report: { provider, query, status: "cached", count: cached.length } };
          const items = await p.search(query, { limit: perQuery, language: lang, signal: controller.signal });
          await setCached(key, provider, items).catch((e) => console.error("[search] cache write failed", e));
          return { items, report: { provider, query, status: "ok", count: items.length } };
        } catch (err) {
          const msg = err instanceof ProviderError ? `${err.kind}: ${err.message.slice(0, 160)}` : "unexpected error";
          console.error(`[search] ${provider} failed`, err);
          return { items: [], report: { provider, query, status: "error", count: 0, error: msg } };
        }
      }),
    );
    return { results: runs.flatMap((r) => r.items), report: runs.map((r) => r.report) };
  } finally {
    clearTimeout(timer);
  }
}
