import { describe, expect, it, vi } from "vitest";
import { parseAuthorChapters, parseIsoDuration, YouTubeProvider } from "@/server/integrations/providers/youtube";
import { normalizeOpenAlexWork, OpenAlexProvider, reconstructAbstract } from "@/server/integrations/providers/openalex";
import { normalizeCrossrefItem, stripJats } from "@/server/integrations/providers/crossref";
import { parseArxivFeed } from "@/server/integrations/providers/arxiv";
import { normalizeRepo, parseGitHubRepoUrl } from "@/server/integrations/providers/github";
import { fetchText, safePublicUrl } from "@/server/integrations/http";
import { ProviderError } from "@/server/integrations/types";

const NOW = "2026-11-17T00:00:00.000Z";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("YouTube adapter", () => {
  it("parses ISO-8601 durations", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT15M")).toBe(900);
    expect(parseIsoDuration("P0D")).toBe(0);
    expect(parseIsoDuration("garbage")).toBeNull();
  });

  it("extracts author chapters only when they follow YouTube's chapter rules", () => {
    const desc = "Intro text\n0:00 Introducción\n2:15 Definición de estacionariedad\n6:40 Prueba ADF\n13:20 Diferenciación";
    const ch = parseAuthorChapters(desc, 1200);
    expect(ch.map((c) => c.startSeconds)).toEqual([0, 135, 400, 800]);
    expect(ch[2]).toMatchObject({ label: "Prueba ADF", endSeconds: 800, verification: "author_chapters" });
    expect(ch[3]?.endSeconds).toBe(1200);
  });

  it("does not invent timestamps from loose mentions", () => {
    expect(parseAuthorChapters("Mira el minuto 6:40 para la prueba ADF", 1200)).toEqual([]);
    expect(parseAuthorChapters("1:00 a\n2:00 b\n3:00 c", 600)).toEqual([]); // no empieza en 0:00
    expect(parseAuthorChapters("0:00 a\n0:05 b\n1:00 c", 600)).toEqual([]); // capítulo < 10 s
    expect(parseAuthorChapters("0:00 a\n5:00 b\n50:00 c", 600)).toEqual([]); // fuera de la duración
  });

  it("reports pending configuration and makes no request without a key", async () => {
    const f = vi.fn();
    const p = new YouTubeProvider(undefined, f as unknown as typeof fetch);
    expect(p.isConfigured()).toBe(false);
    expect(await p.search("x", { limit: 3 })).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it("normalizes search + videos responses", async () => {
    const f = vi.fn(async (url: string) => {
      if (url.includes("/search?")) return jsonResponse({ items: [{ id: { videoId: "abcDEF12345" } }] });
      return jsonResponse({
        items: [
          {
            id: "abcDEF12345",
            snippet: { title: "Stationarity explained", description: "0:00 Intro\n1:00 Mean\n2:00 Variance", channelTitle: "Some Channel", publishedAt: "2024-03-01T00:00:00Z" },
            contentDetails: { duration: "PT10M", caption: "true" },
            status: { license: "youtube", embeddable: true, privacyStatus: "public" },
          },
        ],
      });
    });
    const p = new YouTubeProvider("KEY", f as unknown as typeof fetch);
    const [r] = await p.search("stationarity", { limit: 3, language: "es" });
    expect(r).toMatchObject({ providerId: "youtube", externalId: "abcDEF12345", canonicalUrl: "https://www.youtube.com/watch?v=abcDEF12345", durationSeconds: 600, resourceType: "video" });
    expect(r?.segments).toHaveLength(3);
    const searchUrl = String(f.mock.calls[0]?.[0]);
    expect(searchUrl).toContain("videoEmbeddable=true");
    expect(searchUrl).toContain("relevanceLanguage=es");
  });
});

describe("OpenAlex adapter", () => {
  it("reconstructs abstracts from the inverted index", () => {
    expect(reconstructAbstract({ Stationarity: [0], matters: [1], a: [3], lot: [4], really: [2] })).toBe("Stationarity matters really a lot");
    expect(reconstructAbstract(null)).toBeNull();
  });
  it("prefers the DOI as canonical URL and never claims peer review for journals", () => {
    const r = normalizeOpenAlexWork(
      { id: "https://openalex.org/W1", doi: "https://doi.org/10.1/abc", display_name: "T", type: "article", open_access: { is_oa: true, oa_url: "https://x.org/pdf" }, primary_location: { source: { display_name: "J", type: "journal" } } },
      "q",
      NOW,
    );
    expect(r).toMatchObject({ canonicalUrl: "https://doi.org/10.1/abc", doi: "10.1/abc", externalId: "W1", peerReviewed: null, isOpenAccess: true });
  });
  it("marks preprints as not peer reviewed", () => {
    expect(normalizeOpenAlexWork({ id: "https://openalex.org/W2", display_name: "P", type: "preprint" }, "q", NOW)?.peerReviewed).toBe(false);
  });
  it("sends the optional api_key", async () => {
    const f = vi.fn(async () => jsonResponse({ results: [] }));
    await new OpenAlexProvider("K", f as unknown as typeof fetch).search("q", { limit: 5 });
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain("api_key=K");
  });
});

describe("Crossref adapter", () => {
  it("strips JATS markup and builds DOI URLs", () => {
    expect(stripJats("<jats:p>Hello <jats:i>world</jats:i></jats:p>")).toBe("Hello world");
    const r = normalizeCrossrefItem({ DOI: "10.5/XYZ", title: ["A"], issued: { "date-parts": [[2020, 5]] }, type: "journal-article" }, "q", NOW);
    expect(r).toMatchObject({ canonicalUrl: "https://doi.org/10.5/XYZ", doi: "10.5/xyz", publishedAt: "2020-05-01", resourceType: "paper" });
  });
});

describe("arXiv adapter", () => {
  it("parses Atom entries", () => {
    const xml = `<?xml version="1.0"?><feed><entry><id>http://arxiv.org/abs/2101.00001v1</id><published>2021-01-01T00:00:00Z</published><title>On &amp; Off</title><summary> An abstract. </summary><author><name>Ada L</name></author><link title="pdf" href="http://arxiv.org/pdf/2101.00001v1"/><arxiv:primary_category term="stat.ML"/></entry></feed>`;
    const [r] = parseArxivFeed(xml, "q", NOW);
    expect(r).toMatchObject({ externalId: "2101.00001v1", title: "On & Off", canonicalUrl: "https://arxiv.org/abs/2101.00001v1", peerReviewed: false, authors: ["Ada L"] });
    expect(r?.metadata.pdfUrl).toBe("https://arxiv.org/pdf/2101.00001v1");
  });
});

describe("GitHub adapter", () => {
  it("parses repository URLs safely", () => {
    expect(parseGitHubRepoUrl("https://github.com/user/repo.git")).toEqual({ owner: "user", repo: "repo" });
    expect(parseGitHubRepoUrl("https://evil.com/user/repo")).toBeNull();
    expect(parseGitHubRepoUrl("https://github.com/user")).toBeNull();
  });
  it("ignores NOASSERTION licenses", () => {
    expect(normalizeRepo({ id: 1, full_name: "a/b", html_url: "https://github.com/a/b", description: null, license: { spdx_id: "NOASSERTION" } }, "q", NOW)?.license).toBeNull();
  });
});

describe("http helpers", () => {
  it("upgrades http and rejects credentials or other schemes", () => {
    expect(safePublicUrl("http://example.org/x")).toBe("https://example.org/x");
    expect(safePublicUrl("javascript:alert(1)")).toBeNull();
    expect(safePublicUrl("https://user:pass@example.org")).toBeNull();
  });
  it("retries 5xx and then succeeds", async () => {
    let n = 0;
    const f = vi.fn(async () => (++n < 2 ? new Response("err", { status: 503 }) : new Response("ok")));
    expect(await fetchText("https://x.org", { provider: "openalex", fetchImpl: f as unknown as typeof fetch })).toBe("ok");
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("does not retry auth errors", async () => {
    const f = vi.fn(async () => new Response("nope", { status: 401 }));
    await expect(fetchText("https://x.org", { provider: "github", fetchImpl: f as unknown as typeof fetch })).rejects.toBeInstanceOf(ProviderError);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
