import { fetchJson, safePublicUrl } from "../http";
import type { NormalizedResource, ResourceProvider, ResourceSegment, SearchOptions } from "../types";

/**
 * YouTube Data API v3 (https://developers.google.com/youtube/v3).
 * - search.list (100 unidades de cuota) + videos.list (1 unidad) para duración, licencia y embebible.
 * - NO se descargan transcripciones: captions.download requiere OAuth del propietario del video.
 *   Por eso los únicos fragmentos temporales que mostramos son los capítulos que el propio
 *   autor publicó en la descripción (mismo formato que YouTube usa para generar capítulos).
 */
const API = "https://www.googleapis.com/youtube/v3";

interface SearchResponse {
  items?: { id?: { videoId?: string } }[];
}
interface VideosResponse {
  items?: {
    id: string;
    snippet?: {
      title?: string;
      description?: string;
      channelTitle?: string;
      channelId?: string;
      publishedAt?: string;
      defaultAudioLanguage?: string;
      defaultLanguage?: string;
    };
    contentDetails?: { duration?: string; caption?: string };
    status?: { license?: string; embeddable?: boolean; privacyStatus?: string };
  }[];
}

/** ISO-8601 (PT1H2M3S) -> segundos */
export function parseIsoDuration(iso: string | undefined): number | null {
  if (!iso) return null;
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return null;
  const [, d, h, mi, s] = m;
  return Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(mi ?? 0) * 60 + Number(s ?? 0);
}

function toSeconds(ts: string): number {
  const parts = ts.split(":").map(Number);
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/**
 * Extrae capítulos publicados por el autor en la descripción. Aplica las reglas
 * con las que YouTube reconoce capítulos: el primero empieza en 0:00, al menos 3
 * marcas, en orden ascendente, cada uno de al menos 10 s.
 */
export function parseAuthorChapters(description: string, durationSeconds: number | null): ResourceSegment[] {
  const lines = description.split(/\r?\n/);
  const found: { start: number; label: string }[] = [];
  const re = /^\s*(?:[-•*]\s*)?\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\s*[-–—:|]?\s*(.+?)\s*$/;
  for (const line of lines) {
    const m = re.exec(line);
    if (m && m[1] && m[2]) found.push({ start: toSeconds(m[1]), label: m[2].slice(0, 200) });
  }
  if (found.length < 3 || found[0]?.start !== 0) return [];
  for (let i = 1; i < found.length; i++) {
    const prev = found[i - 1]!;
    const cur = found[i]!;
    if (cur.start <= prev.start || cur.start - prev.start < 10) return [];
  }
  if (durationSeconds != null && found.some((f) => f.start >= durationSeconds)) return [];
  return found.map((f, i) => ({
    label: f.label,
    startSeconds: f.start,
    endSeconds: found[i + 1]?.start ?? durationSeconds,
    verification: "author_chapters",
    verificationSource: "Capítulos publicados por el autor en la descripción del video (YouTube Data API v3).",
  }));
}

export class YouTubeProvider implements ResourceProvider {
  readonly id = "youtube" as const;
  constructor(
    private apiKey: string | undefined,
    private fetchImpl?: typeof fetch,
  ) {}

  isConfigured() {
    return !!this.apiKey;
  }

  async search(query: string, opts: SearchOptions): Promise<NormalizedResource[]> {
    if (!this.apiKey) return [];
    const params = new URLSearchParams({
      part: "snippet",
      type: "video",
      q: query,
      maxResults: String(Math.min(opts.limit, 10)),
      videoEmbeddable: "true",
      safeSearch: "strict",
      key: this.apiKey,
    });
    if (opts.language) params.set("relevanceLanguage", opts.language);
    const searchUrl = `${API}/search?${params}`;
    const search = await fetchJson<SearchResponse>(searchUrl, { provider: this.id, signal: opts.signal, fetchImpl: this.fetchImpl });
    const ids = (search.items ?? []).map((i) => i.id?.videoId).filter((x): x is string => !!x);
    if (ids.length === 0) return [];

    const vParams = new URLSearchParams({ part: "snippet,contentDetails,status", id: ids.join(","), key: this.apiKey });
    const videos = await fetchJson<VideosResponse>(`${API}/videos?${vParams}`, {
      provider: this.id,
      signal: opts.signal,
      fetchImpl: this.fetchImpl,
    });
    const fetchedAt = new Date().toISOString();
    return (videos.items ?? [])
      .filter((v) => v.status?.privacyStatus !== "private")
      .map((v): NormalizedResource => {
        const duration = parseIsoDuration(v.contentDetails?.duration);
        const description = v.snippet?.description ?? "";
        return {
          providerId: "youtube",
          externalId: v.id,
          canonicalUrl: safePublicUrl(`https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`)!,
          title: v.snippet?.title ?? "(sin título)",
          authors: v.snippet?.channelTitle ? [v.snippet.channelTitle] : [],
          organization: v.snippet?.channelTitle ?? null,
          publishedAt: v.snippet?.publishedAt?.slice(0, 10) ?? null,
          resourceType: "video",
          language: v.snippet?.defaultAudioLanguage ?? v.snippet?.defaultLanguage ?? null,
          license: v.status?.license === "creativeCommon" ? "CC BY (YouTube Creative Commons)" : "Standard YouTube License",
          isOpenAccess: true,
          peerReviewed: false,
          durationSeconds: duration,
          doi: null,
          abstract: description.slice(0, 1500) || null,
          metadata: {
            channelId: v.snippet?.channelId ?? null,
            embeddable: v.status?.embeddable ?? null,
            hasCaptions: v.contentDetails?.caption === "true",
          },
          provenance: { provider: "youtube", endpoint: "search.list+videos.list", query, fetchedAt },
          segments: parseAuthorChapters(description, duration),
        };
      });
  }
}
