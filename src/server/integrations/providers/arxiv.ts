import { fetchText, safePublicUrl } from "../http";
import type { NormalizedResource, ResourceProvider, SearchOptions } from "../types";

/** arXiv API (https://info.arxiv.org/help/api). Respuesta Atom XML. */
const API = "https://export.arxiv.org/api/query";

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(xml: string, name: string): string | null {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(xml);
  return m?.[1] != null ? decodeXml(m[1]) : null;
}

export function parseArxivFeed(xml: string, query: string, fetchedAt: string): NormalizedResource[] {
  const entries = xml.split(/<entry>/).slice(1).map((e) => e.split(/<\/entry>/)[0] ?? "");
  const out: NormalizedResource[] = [];
  for (const e of entries) {
    const idUrl = tag(e, "id");
    const title = tag(e, "title");
    if (!idUrl || !title) continue;
    const absUrl = safePublicUrl(idUrl);
    if (!absUrl) continue;
    const arxivId = idUrl.replace(/^https?:\/\/arxiv\.org\/abs\//, "");
    const authors = [...e.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((m) => decodeXml(m[1] ?? "")).filter(Boolean);
    const doi = tag(e, "arxiv:doi");
    const pdf = /<link[^>]*title="pdf"[^>]*href="([^"]+)"/.exec(e)?.[1] ?? /<link[^>]*href="([^"]+)"[^>]*title="pdf"/.exec(e)?.[1];
    const category = /<arxiv:primary_category[^>]*term="([^"]+)"/.exec(e)?.[1] ?? null;
    out.push({
      providerId: "arxiv",
      externalId: arxivId,
      canonicalUrl: absUrl,
      title,
      authors: authors.slice(0, 12),
      organization: "arXiv",
      publishedAt: tag(e, "published")?.slice(0, 10) ?? null,
      resourceType: "preprint",
      language: null,
      license: null,
      isOpenAccess: true,
      peerReviewed: false,
      durationSeconds: null,
      doi: doi ?? null,
      abstract: tag(e, "summary")?.slice(0, 3000) ?? null,
      metadata: { pdfUrl: safePublicUrl(pdf ?? null), primaryCategory: category, journalRef: tag(e, "arxiv:journal_ref") },
      provenance: { provider: "arxiv", endpoint: "/api/query", query, fetchedAt },
      segments: [],
    });
  }
  return out;
}

export class ArxivProvider implements ResourceProvider {
  readonly id = "arxiv" as const;
  constructor(private fetchImpl?: typeof fetch) {}
  isConfigured() {
    return true;
  }
  async search(query: string, opts: SearchOptions): Promise<NormalizedResource[]> {
    const terms = query.replace(/["()]/g, " ").trim().split(/\s+/).slice(0, 8).map((t) => `all:${t}`).join(" AND ");
    const params = new URLSearchParams({ search_query: terms, start: "0", max_results: String(Math.min(opts.limit, 15)) });
    const xml = await fetchText(`${API}?${params}`, { provider: this.id, signal: opts.signal, fetchImpl: this.fetchImpl });
    return parseArxivFeed(xml, query, new Date().toISOString());
  }
}
