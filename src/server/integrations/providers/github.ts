import { fetchJson, safePublicUrl } from "../http";
import type { NormalizedResource, ResourceProvider, SearchOptions } from "../types";

/**
 * GitHub REST API — búsqueda de repositorios (https://docs.github.com/rest/search).
 * Orden por relevancia (no por estrellas): la popularidad no equivale a calidad académica.
 * Se usa para implementaciones de referencia; la UI insiste en no copiar soluciones completas.
 */
const API = "https://api.github.com";

interface Repo {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  owner?: { login?: string };
  stargazers_count?: number;
  language?: string | null;
  license?: { spdx_id?: string | null } | null;
  pushed_at?: string;
  archived?: boolean;
  topics?: string[];
}

export function normalizeRepo(r: Repo, query: string, fetchedAt: string): NormalizedResource | null {
  const url = safePublicUrl(r.html_url);
  if (!url || !url.startsWith("https://github.com/")) return null;
  return {
    providerId: "github",
    externalId: String(r.id),
    canonicalUrl: url,
    title: r.full_name,
    authors: r.owner?.login ? [r.owner.login] : [],
    organization: r.owner?.login ?? null,
    publishedAt: r.pushed_at?.slice(0, 10) ?? null,
    resourceType: "repository",
    language: null,
    license: r.license?.spdx_id && r.license.spdx_id !== "NOASSERTION" ? r.license.spdx_id : null,
    isOpenAccess: true,
    peerReviewed: false,
    durationSeconds: null,
    doi: null,
    abstract: r.description?.slice(0, 1000) ?? null,
    metadata: {
      stars: r.stargazers_count ?? null,
      programmingLanguage: r.language ?? null,
      archived: r.archived ?? false,
      topics: r.topics ?? [],
      lastPush: r.pushed_at ?? null,
    },
    provenance: { provider: "github", endpoint: "/search/repositories", query, fetchedAt },
    segments: [],
  };
}

export class GitHubProvider implements ResourceProvider {
  readonly id = "github" as const;
  constructor(
    private token: string | undefined,
    private fetchImpl?: typeof fetch,
  ) {}
  isConfigured() {
    return true;
  }
  private headers(): Record<string, string> {
    return {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };
  }
  async search(query: string, opts: SearchOptions): Promise<NormalizedResource[]> {
    const params = new URLSearchParams({ q: `${query} archived:false`, per_page: String(Math.min(opts.limit, 10)) });
    const data = await fetchJson<{ items?: Repo[] }>(`${API}/search/repositories?${params}`, {
      provider: this.id,
      headers: this.headers(),
      signal: opts.signal,
      fetchImpl: this.fetchImpl,
    });
    const fetchedAt = new Date().toISOString();
    return (data.items ?? []).map((r) => normalizeRepo(r, query, fetchedAt)).filter((x): x is NormalizedResource => !!x);
  }

  /** Lectura real de un repositorio entregado como evidencia: README + árbol de archivos (acotado). */
  async inspectRepository(
    owner: string,
    repo: string,
    signal?: AbortSignal,
  ): Promise<{ readme: string | null; files: string[]; defaultBranch: string; description: string | null }> {
    const meta = await fetchJson<{ default_branch: string; description: string | null }>(
      `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      { provider: this.id, headers: this.headers(), signal, fetchImpl: this.fetchImpl },
    );
    let readme: string | null = null;
    try {
      const r = await fetchJson<{ content?: string; encoding?: string }>(
        `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`,
        { provider: this.id, headers: this.headers(), signal, fetchImpl: this.fetchImpl, retries: 0 },
      );
      if (r.content && r.encoding === "base64") readme = Buffer.from(r.content, "base64").toString("utf8");
    } catch {
      readme = null;
    }
    const tree = await fetchJson<{ tree?: { path: string; type: string }[]; truncated?: boolean }>(
      `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(meta.default_branch)}?recursive=1`,
      { provider: this.id, headers: this.headers(), signal, fetchImpl: this.fetchImpl, retries: 0 },
    );
    const files = (tree.tree ?? []).filter((t) => t.type === "blob").map((t) => t.path).slice(0, 400);
    return { readme, files, defaultBranch: meta.default_branch, description: meta.description };
  }
}

/** Extrae owner/repo de una URL de GitHub válida. */
export function parseGitHubRepoUrl(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url);
    if (u.hostname !== "github.com") return null;
    const [owner, repo] = u.pathname.replace(/^\/+/, "").split("/");
    if (!owner || !repo || !/^[A-Za-z0-9-]{1,39}$/.test(owner) || !/^[A-Za-z0-9._-]{1,100}$/.test(repo)) return null;
    return { owner, repo: repo.replace(/\.git$/, "") };
  } catch {
    return null;
  }
}
