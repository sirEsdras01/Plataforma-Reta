import { fetchJson, safePublicUrl } from "../http";
import type { NormalizedResource, ResourceProvider, ResourceType, SearchOptions } from "../types";

/** OpenAlex Works API (https://docs.openalex.org). Clave opcional vía `api_key`. */
const API = "https://api.openalex.org/works";

interface OpenAlexWork {
  id: string;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_date?: string | null;
  language?: string | null;
  type?: string | null;
  cited_by_count?: number;
  open_access?: { is_oa?: boolean; oa_url?: string | null };
  authorships?: { author?: { display_name?: string } }[];
  primary_location?: {
    landing_page_url?: string | null;
    license?: string | null;
    source?: { display_name?: string | null; type?: string | null } | null;
  } | null;
  abstract_inverted_index?: Record<string, number[]> | null;
}

/** Reconstruye el abstract a partir del índice invertido de OpenAlex. */
export function reconstructAbstract(idx: Record<string, number[]> | null | undefined): string | null {
  if (!idx) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(idx)) for (const p of positions) words[p] = word;
  const text = words.filter((w) => w !== undefined).join(" ").trim();
  return text || null;
}

function mapType(t: string | null | undefined): ResourceType {
  switch (t) {
    case "preprint":
      return "preprint";
    case "book":
      return "book";
    case "book-chapter":
      return "book_chapter";
    case "dataset":
      return "dataset";
    case "article":
    case "review":
      return "paper";
    default:
      return "other";
  }
}

export function normalizeOpenAlexWork(w: OpenAlexWork, query: string, fetchedAt: string): NormalizedResource | null {
  const doiUrl = safePublicUrl(w.doi ?? null);
  const landing = safePublicUrl(w.primary_location?.landing_page_url ?? null);
  const canonical = doiUrl ?? landing ?? safePublicUrl(w.id);
  const title = w.display_name ?? w.title;
  if (!canonical || !title) return null;
  const type = mapType(w.type);
  return {
    providerId: "openalex",
    externalId: w.id.replace("https://openalex.org/", ""),
    canonicalUrl: canonical,
    title,
    authors: (w.authorships ?? []).map((a) => a.author?.display_name).filter((x): x is string => !!x).slice(0, 12),
    organization: w.primary_location?.source?.display_name ?? null,
    publishedAt: w.publication_date ?? null,
    resourceType: type,
    language: w.language ?? null,
    license: w.primary_location?.license ?? null,
    isOpenAccess: w.open_access?.is_oa ?? null,
    // Solo afirmamos "no revisado" para preprints; para artículos de revista no lo
    // afirmamos como verificado (OpenAlex no expone revisión por pares de forma explícita).
    peerReviewed: type === "preprint" ? false : null,
    durationSeconds: null,
    doi: w.doi ? w.doi.replace(/^https:\/\/doi\.org\//, "") : null,
    abstract: reconstructAbstract(w.abstract_inverted_index)?.slice(0, 3000) ?? null,
    metadata: {
      venue: w.primary_location?.source?.display_name ?? null,
      venueType: w.primary_location?.source?.type ?? null,
      citedByCount: w.cited_by_count ?? null,
      oaUrl: safePublicUrl(w.open_access?.oa_url ?? null),
      workType: w.type ?? null,
    },
    provenance: { provider: "openalex", endpoint: "/works?search", query, fetchedAt },
    segments: [],
  };
}

export class OpenAlexProvider implements ResourceProvider {
  readonly id = "openalex" as const;
  constructor(
    private apiKey: string | undefined,
    private fetchImpl?: typeof fetch,
  ) {}
  isConfigured() {
    return true;
  }
  async search(query: string, opts: SearchOptions): Promise<NormalizedResource[]> {
    const params = new URLSearchParams({
      search: query,
      per_page: String(Math.min(opts.limit, 25)),
      select:
        "id,doi,title,display_name,publication_date,language,type,cited_by_count,open_access,authorships,primary_location,abstract_inverted_index",
    });
    if (this.apiKey) params.set("api_key", this.apiKey);
    const data = await fetchJson<{ results?: OpenAlexWork[] }>(`${API}?${params}`, {
      provider: this.id,
      signal: opts.signal,
      fetchImpl: this.fetchImpl,
    });
    const fetchedAt = new Date().toISOString();
    return (data.results ?? []).map((w) => normalizeOpenAlexWork(w, query, fetchedAt)).filter((x): x is NormalizedResource => !!x);
  }
}
