import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import type { NormalizedResource, ProviderKey } from "./types";

const TTL_HOURS: Record<ProviderKey, number> = {
  youtube: 72, // reduce el consumo de cuota (100 unidades por búsqueda)
  openalex: 168,
  crossref: 168,
  arxiv: 168,
  github: 48,
};

export function cacheKey(provider: ProviderKey, query: string, limit: number, language?: string) {
  const norm = query.trim().toLowerCase().replace(/\s+/g, " ");
  return `${provider}:${createHash("sha256").update(`${norm}|${limit}|${language ?? ""}`).digest("hex").slice(0, 32)}`;
}

export async function getCached(key: string): Promise<NormalizedResource[] | null> {
  const { data, error } = await createAdminClient()
    .from("provider_cache")
    .select("payload, expires_at")
    .eq("cache_key", key)
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) return null;
  return data.payload as NormalizedResource[];
}

export async function setCached(key: string, provider: ProviderKey, payload: NormalizedResource[]) {
  const expires = new Date(Date.now() + TTL_HOURS[provider] * 3600_000).toISOString();
  await createAdminClient()
    .from("provider_cache")
    .upsert({ cache_key: key, provider_id: provider, payload, expires_at: expires });
}
