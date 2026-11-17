/**
 * Deduplicación y ranking heurístico de candidatos (paso previo a la selección por LLM).
 * Funciones puras: se prueban sin red.
 *
 * El ranking NO usa popularidad (estrellas, vistas, citas) como señal principal;
 * prioriza correspondencia con el concepto, autoridad del tipo de fuente,
 * acceso abierto, metadatos verificables e idioma.
 */
import type { NormalizedResource } from "../integrations/types";

export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Elimina duplicados entre proveedores (mismo DOI o mismo título normalizado). Conserva el más rico. */
export function dedupe(resources: NormalizedResource[]): NormalizedResource[] {
  const richness = (r: NormalizedResource) =>
    (r.abstract ? 2 : 0) + (r.isOpenAccess ? 1 : 0) + (r.authors.length ? 1 : 0) + (r.providerId === "openalex" ? 1 : 0);
  const byKey = new Map<string, NormalizedResource>();
  for (const r of resources) {
    const keys = [r.doi ? `doi:${r.doi.toLowerCase()}` : null, `t:${normalizeTitle(r.title)}`, `u:${r.canonicalUrl}`].filter(
      (k): k is string => !!k,
    );
    const existingKey = keys.find((k) => byKey.has(k));
    if (existingKey) {
      const existing = byKey.get(existingKey)!;
      const winner = richness(r) > richness(existing) ? r : existing;
      // Re-apunta todas las claves del registro anterior y las nuevas al ganador.
      for (const [k, v] of byKey) if (v === existing) byKey.set(k, winner);
      for (const k of keys) byKey.set(k, winner);
      continue;
    }
    for (const k of keys) byKey.set(k, r);
  }
  return [...new Set(byKey.values())];
}

function tokens(s: string): Set<string> {
  return new Set(normalizeTitle(s).split(" ").filter((w) => w.length > 2));
}

export interface RankContext {
  conceptTerms: string; // nombre del concepto + consulta
  preferredLanguage: string;
  nowYear?: number;
}

export interface ScoredResource {
  resource: NormalizedResource;
  score: number;
  signals: Record<string, number>;
}

export function scoreResource(r: NormalizedResource, ctx: RankContext): ScoredResource {
  const q = tokens(ctx.conceptTerms);
  const text = tokens(`${r.title} ${r.abstract ?? ""}`);
  let overlap = 0;
  for (const w of q) if (text.has(w)) overlap++;
  const relevance = q.size ? overlap / q.size : 0;

  const typeAuthority: Record<string, number> = {
    paper: 0.8,
    book: 0.85,
    book_chapter: 0.8,
    preprint: 0.55,
    video: 0.6,
    repository: 0.55,
    documentation: 0.85,
    course: 0.75,
    dataset: 0.6,
    other: 0.3,
  };
  const authority = typeAuthority[r.resourceType] ?? 0.3;
  const access = r.isOpenAccess ? 1 : r.isOpenAccess === false ? 0.2 : 0.5;
  const metadataQuality = (r.abstract ? 0.5 : 0) + (r.authors.length ? 0.25 : 0) + (r.publishedAt ? 0.25 : 0);
  const lang = r.language ? (r.language.startsWith(ctx.preferredLanguage) ? 1 : r.language.startsWith("en") ? 0.7 : 0.4) : 0.6;

  // Videos: preferimos piezas cortas o con capítulos verificables (aprendizaje just-in-time).
  let format = 0.6;
  if (r.resourceType === "video" && r.durationSeconds) {
    const min = r.durationSeconds / 60;
    format = min >= 4 && min <= 35 ? 1 : min < 4 ? 0.4 : r.segments.length ? 0.8 : 0.3;
  }
  if (r.resourceType === "repository") format = (r.metadata.archived ? 0.2 : 0.7) + (r.license ? 0.2 : 0);

  const signals = { relevance, authority, access, metadataQuality, lang, format };
  const score =
    0.4 * relevance + 0.15 * authority + 0.1 * access + 0.1 * metadataQuality + 0.1 * lang + 0.15 * format;
  return { resource: r, score: Math.round(score * 10000) / 10000, signals };
}

/** Ordena y diversifica: como máximo `perProvider` por proveedor dentro del top-N. */
export function rankCandidates(
  resources: NormalizedResource[],
  ctx: RankContext,
  topN = 12,
  perProvider = 4,
): ScoredResource[] {
  const scored = dedupe(resources)
    .map((r) => scoreResource(r, ctx))
    .sort((a, b) => b.score - a.score);
  const counts = new Map<string, number>();
  const out: ScoredResource[] = [];
  for (const s of scored) {
    const c = counts.get(s.resource.providerId) ?? 0;
    if (c >= perProvider) continue;
    counts.set(s.resource.providerId, c + 1);
    out.push(s);
    if (out.length >= topN) break;
  }
  return out;
}
