export type ProviderKey = "youtube" | "openalex" | "crossref" | "arxiv" | "github";
export type ResourceType =
  | "video"
  | "paper"
  | "preprint"
  | "book"
  | "book_chapter"
  | "repository"
  | "documentation"
  | "course"
  | "dataset"
  | "other";

export interface ResourceSegment {
  label: string;
  startSeconds: number | null;
  endSeconds: number | null;
  /** Solo 'author_chapters' / 'official_toc' / 'transcript' se muestran como verificados. */
  verification: "author_chapters" | "official_toc" | "transcript" | "unverified";
  verificationSource: string;
}

export interface Provenance {
  provider: ProviderKey;
  endpoint: string;
  query: string;
  fetchedAt: string;
}

/** Metadatos normalizados, independientes del proveedor. */
export interface NormalizedResource {
  providerId: ProviderKey;
  externalId: string;
  canonicalUrl: string;
  title: string;
  authors: string[];
  organization: string | null;
  publishedAt: string | null; // YYYY-MM-DD
  resourceType: ResourceType;
  language: string | null;
  license: string | null;
  isOpenAccess: boolean | null;
  peerReviewed: boolean | null;
  durationSeconds: number | null;
  doi: string | null;
  abstract: string | null;
  metadata: Record<string, unknown>;
  provenance: Provenance;
  segments: ResourceSegment[];
}

export interface SearchOptions {
  limit: number;
  language?: string;
  signal?: AbortSignal;
}

export interface ResourceProvider {
  readonly id: ProviderKey;
  /** false => "configuración pendiente": el orquestador lo omite y lo reporta. */
  isConfigured(): boolean;
  search(query: string, opts: SearchOptions): Promise<NormalizedResource[]>;
}

export class ProviderError extends Error {
  constructor(
    public readonly provider: ProviderKey,
    public readonly kind: "quota" | "auth" | "http" | "parse" | "timeout" | "network",
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ProviderError";
  }
}
