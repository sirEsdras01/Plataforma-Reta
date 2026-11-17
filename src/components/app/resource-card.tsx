import { Bookmark, BookmarkCheck, ExternalLink, FileText, FolderGit2, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { formatSeconds } from "@/lib/utils";
import { toggleSavedResourceAction } from "@/app/(app)/actions";

export interface ResourceView {
  id: string; // concept_resources.id
  rank: number;
  reason: string;
  confidence: string;
  saved: boolean;
  resource: {
    id: string;
    provider_id: string;
    external_id: string;
    canonical_url: string;
    title: string;
    authors: string[];
    organization: string | null;
    published_at: string | null;
    resource_type: string;
    license: string | null;
    is_open_access: boolean | null;
    peer_reviewed: boolean | null;
    duration_seconds: number | null;
    doi: string | null;
    metadata: Record<string, unknown>;
    provenance: { provider: string; endpoint: string; query: string; fetchedAt: string };
    resource_segments: { id: string; label: string; start_seconds: number | null; end_seconds: number | null; verification: string; verification_source: string | null }[];
  };
}

const TYPE_LABEL: Record<string, string> = { video: "Video", paper: "Artículo", preprint: "Preprint", book: "Libro", book_chapter: "Capítulo de libro", repository: "Repositorio", documentation: "Documentación", course: "Curso", dataset: "Dataset", other: "Recurso" };

export function ResourceCard({ r, path, embed = true }: { r: ResourceView; path: string; embed?: boolean }) {
  const res = r.resource;
  const Icon = res.resource_type === "video" ? PlayCircle : res.resource_type === "repository" ? FolderGit2 : FileText;
  const verifiedSegments = res.resource_segments.filter((s) => s.verification !== "unverified").sort((a, b) => (a.start_seconds ?? 0) - (b.start_seconds ?? 0));
  const embeddable = res.provider_id === "youtube" && res.metadata.embeddable === true && /^[A-Za-z0-9_-]{6,20}$/.test(res.external_id);
  const pdfOrOa = (res.metadata.oaUrl as string | null) ?? (res.metadata.pdfUrl as string | null) ?? null;
  return (
    <article className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className="h-3.5 w-3.5" /> {TYPE_LABEL[res.resource_type] ?? res.resource_type} · {res.provenance.provider}
            {res.published_at ? ` · ${res.published_at.slice(0, 4)}` : ""}
            {res.duration_seconds ? ` · ${formatSeconds(res.duration_seconds)}` : ""}
          </p>
          <a href={res.canonical_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-start gap-1 font-medium hover:underline">
            {res.title} <ExternalLink className="mt-1 h-3 w-3 shrink-0" />
          </a>
          <p className="text-xs text-muted-foreground">{res.authors.slice(0, 4).join(", ")}{res.authors.length > 4 ? " et al." : ""}{res.organization && res.organization !== res.authors[0] ? ` · ${res.organization}` : ""}</p>
        </div>
        <form action={toggleSavedResourceAction}>
          <input type="hidden" name="conceptResourceId" value={r.id} />
          <input type="hidden" name="saved" value={String(!r.saved)} />
          <input type="hidden" name="path" value={path} />
          <button type="submit" className="rounded-md p-1.5 hover:bg-muted" aria-label={r.saved ? "Quitar de guardados" : "Guardar recurso"}>
            {r.saved ? <BookmarkCheck className="h-4 w-4 text-primary" /> : <Bookmark className="h-4 w-4" />}
          </button>
        </form>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {res.is_open_access && <Badge tone="success">Acceso abierto</Badge>}
        {res.peer_reviewed === false && <Badge tone="warning">Sin revisión por pares</Badge>}
        {res.metadata.venue ? <Badge>Publicado en: {String(res.metadata.venue)}</Badge> : null}
        {res.license && <Badge>Licencia: {res.license}</Badge>}
        {res.doi && <Badge>DOI {res.doi}</Badge>}
        <Badge tone={r.confidence === "high" ? "success" : r.confidence === "medium" ? "primary" : "warning"}>Confianza {r.confidence === "high" ? "alta" : r.confidence === "medium" ? "media" : "baja"}</Badge>
      </div>
      <p className="mt-3 whitespace-pre-line text-sm">{r.reason}</p>
      {embed && embeddable && (
        <div className="mt-3 aspect-video overflow-hidden rounded-md border">
          <iframe
            className="h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${res.external_id}${verifiedSegments[0]?.start_seconds ? `?start=${verifiedSegments[0].start_seconds}` : ""}`}
            title={res.title}
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}
      {verifiedSegments.length > 0 ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground">Fragmentos verificados ({verifiedSegments.length}) · {verifiedSegments[0]?.verification_source}</summary>
          <ul className="mt-2 space-y-1">
            {verifiedSegments.map((s) => (
              <li key={s.id}>
                {s.start_seconds != null && res.provider_id === "youtube" ? (
                  <a className="underline" target="_blank" rel="noopener noreferrer" href={`https://www.youtube.com/watch?v=${res.external_id}&t=${s.start_seconds}s`}>
                    {formatSeconds(s.start_seconds)}{s.end_seconds ? `–${formatSeconds(s.end_seconds)}` : ""}
                  </a>
                ) : null}{" "}
                {s.label}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        res.resource_type === "video" && <p className="mt-2 text-xs text-muted-foreground">Sin capítulos ni transcripción verificable: no se indican minutos exactos.</p>
      )}
      {pdfOrOa && <a href={pdfOrOa} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-primary underline">Texto completo de acceso abierto</a>}
      <p className="mt-2 text-[11px] text-muted-foreground">Procedencia: {res.provenance.provider} {res.provenance.endpoint} · consulta “{res.provenance.query}” · {res.provenance.fetchedAt.slice(0, 10)}</p>
    </article>
  );
}
