import { ProviderError, type ProviderKey } from "./types";

const USER_AGENT = "EduhackLearningPlatform/0.1 (educational resource discovery)";

export interface FetchOptions {
  provider: ProviderKey;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/** Solo permitimos URLs https de los hosts esperados (validación de URL salientes). */
export function assertAllowedUrl(url: string, allowedHosts: string[]) {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (u.protocol !== "https:") throw new Error(`Only https URLs are allowed: ${url}`);
  if (!allowedHosts.includes(u.hostname)) throw new Error(`Host not allowed: ${u.hostname}`);
}

/** Valida que una URL devuelta por un proveedor sea https y bien formada antes de mostrarla. */
export function safePublicUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol === "http:") u.protocol = "https:";
    if (u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch con timeout, reintentos acotados (429/5xx/red) y errores tipados. */
export async function fetchText(url: string, opts: FetchOptions): Promise<string> {
  const retries = opts.retries ?? 2;
  const doFetch = opts.fetchImpl ?? fetch;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 12_000);
    const onAbort = () => controller.abort();
    opts.signal?.addEventListener("abort", onAbort);
    try {
      const res = await doFetch(url, {
        headers: { "User-Agent": USER_AGENT, ...opts.headers },
        signal: controller.signal,
        cache: "no-store",
      });
      if (res.ok) return await res.text();
      const body = (await res.text().catch(() => "")).slice(0, 300);
      if (res.status === 401) throw new ProviderError(opts.provider, "auth", `401 ${body}`);
      if (res.status === 403 && /quota|rate limit/i.test(body)) throw new ProviderError(opts.provider, "quota", `403 ${body}`);
      if (res.status === 403) throw new ProviderError(opts.provider, "auth", `403 ${body}`);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new ProviderError(opts.provider, res.status === 429 ? "quota" : "http", `${res.status} ${body}`);
        if (attempt < retries) {
          const retryAfter = Number(res.headers.get("retry-after"));
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 10) * 1000 : 500 * 2 ** attempt);
          continue;
        }
        throw lastErr;
      }
      throw new ProviderError(opts.provider, "http", `${res.status} ${body}`);
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      const isAbort = err instanceof Error && err.name === "AbortError";
      lastErr = new ProviderError(opts.provider, isAbort ? "timeout" : "network", String(err), { cause: err });
      if (opts.signal?.aborted) throw lastErr;
      if (attempt < retries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw lastErr;
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }
  throw lastErr;
}

export async function fetchJson<T>(url: string, opts: FetchOptions): Promise<T> {
  const text = await fetchText(url, opts);
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new ProviderError(opts.provider, "parse", "Invalid JSON", { cause: err });
  }
}
