import { fetchJson, safePublicUrl } from "../http";
import type { NormalizedResource, ResourceProvider, ResourceType, SearchOptions } from "../types";

/** Crossref REST API (https://api.crossref.org). `mailto` opcional para el polite pool. */
const API = "https://api.crossref.org/works";

interface CrossrefItem {
  DOI: string;
  URL?: string;
  title?: string[];
  author?: { given?: string; family?: string; name?: string }[];
  issued?: { "date-parts"?: (number | null)[][] };
  type?: string;
  "container-title"?: string[];
  license?: { URL?: string }[];
  abstract?: string;
  language?: string;
}

export function stripJats(s: string | undefined): string | null {
  if (!s) return null;
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null;
}

function mapType(t: string | undefined): ResourceType {
  if (t === "posted-content") return "preprint";
  if (t === "book" || t === "monograph" || t === "edited-book") return "book";
  if (t === "book-chapter") return "book_chapter";
  if (t === "dataset") return "dataset";
  if (t === "journal-article" || t === "proceedings-article") return "paper";
  return "other";
}

export function normalizeCrossrefItem(it: CrossrefItem, query: string, fetchedAt: string): NormalizedResource | null {
  const title = it.title?.[0];
  const canonical = safePublicUrl(`https://doi.org/${it.DOI}`);
  if (!title || !canonical) return null;
  const parts = it.issued?.["date-parts"]?.[0] ?? [];
  const [y, m, d] = parts;
  const date = y ? `${y}-${String(m ?? 1).padStart(2, "0")}-${String(d ?? 1).padStart(2, "0")}` : null;
  const type = mapType(it.type);
  return {
    providerId: "crossref",
    externalId: it.DOI.toLowerCase(),
    canonicalUrl: canonical,
    title,
    authors: (it.author ?? [])
      .map((a) => a.name ?? [a.given, a.family].filter(Boolean).join(" "))
      .filter(Boolean)
      .slice(0, 12),
    organization: it["container-title"]?.[0] ?? null,
    publishedAt: date,
    resourceType: type,
    language: it.language ?? null,
    license: it.license?.[0]?.URL ?? null,
    isOpenAccess: null,
    peerReviewed: type === "preprint" ? false : null,
    durationSeconds: null,
    doi: it.DOI.toLowerCase(),
    abstract: stripJats(it.abstract)?.slice(0, 3000) ?? null,
    metadata: { venue: it["container-title"]?.[0] ?? null, crossrefType: it.type ?? null, datePrecision: parts.length },
    provenance: { provider: "crossref", endpoint: "/works?query", query, fetchedAt },
    segments: [],
  };
}

export class CrossrefProvider implements ResourceProvider {
  readonly id = "crossref" as const;
  constructor(
    private mailto: string | undefined,
    private fetchImpl?: typeof fetch,
  ) {}
  isConfigured() {
    return true;
  }
  async search(query: string, opts: SearchOptions): Promise<NormalizedResource[]> {
    const params = new URLSearchParams({
      query,
      rows: String(Math.min(opts.limit, 20)),
      select: "DOI,URL,title,author,issued,type,container-title,license,abstract,language",
    });
    if (this.mailto) params.set("mailto", this.mailto);
    const data = await fetchJson<{ message?: { items?: CrossrefItem[] } }>(`${API}?${params}`, {
      provider: this.id,
      signal: opts.signal,
      fetchImpl: this.fetchImpl,
    });
    const fetchedAt = new Date().toISOString();
    return (data.message?.items ?? []).map((i) => normalizeCrossrefItem(i, query, fetchedAt)).filter((x): x is NormalizedResource => !!x);
  }
}
