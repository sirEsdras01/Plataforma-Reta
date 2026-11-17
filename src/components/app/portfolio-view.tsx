import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import type { PortfolioContent } from "@/domain/schemas";
import type { PortfolioEvidence } from "@/domain/portfolio";

const EVIDENCE: Record<string, string> = { received: "Evidencia recibida", analyzed: "Evidencia analizada", verified: "Resultado verificado", pending_review: "Pendiente de revisión" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="text-sm leading-relaxed">{children}</div>
    </section>
  );
}
const L = ({ xs }: { xs: string[] }) => (xs.length ? <ul className="list-disc space-y-0.5 pl-5">{xs.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="text-muted-foreground">No reportado.</p>);

/** Página profesional de proyecto (usada en la vista privada, la pública y la impresión a PDF). */
export function PortfolioView({ c, evidences, author }: { c: PortfolioContent; evidences: PortfolioEvidence[]; author?: string | null }) {
  return (
    <article className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{c.title}</h1>
        {author && <p className="mt-1 text-sm text-muted-foreground">{author}</p>}
        <p className="mt-4 text-base">{c.executive_summary}</p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {c.repository_url && <a className="inline-flex items-center gap-1 text-primary underline" href={c.repository_url} target="_blank" rel="noopener noreferrer">Repositorio <ExternalLink className="h-3 w-3" /></a>}
          {c.demo_url && <a className="inline-flex items-center gap-1 text-primary underline" href={c.demo_url} target="_blank" rel="noopener noreferrer">Demostración <ExternalLink className="h-3 w-3" /></a>}
        </div>
      </header>
      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Problema abordado">{c.problem}</Section>
        <Section title="Objetivos"><L xs={c.objectives} /></Section>
        <Section title="Metodología">{c.methodology}</Section>
        <Section title="Arquitectura">{c.architecture}</Section>
        <Section title="Resultados">{c.results}</Section>
        <Section title="Métricas"><L xs={c.metrics} /></Section>
        <Section title="Limitaciones"><L xs={c.limitations} /></Section>
        <Section title="Aprendizajes"><L xs={c.learnings} /></Section>
      </div>
      <Section title="Tecnologías"><div className="flex flex-wrap gap-1.5">{c.technologies.map((t) => <Badge key={t}>{t}</Badge>)}</div></Section>
      <Section title="Competencias desarrolladas"><div className="flex flex-wrap gap-1.5">{c.competencies.map((t) => <Badge key={t} tone="primary">{t}</Badge>)}</div></Section>
      <Section title="Evidencias por módulo">
        <ul className="space-y-1">
          {evidences.map((e, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{e.moduleTitle}</span>
              <Badge tone={e.evidenceStatus === "verified" ? "success" : e.evidenceStatus === "analyzed" ? "primary" : "neutral"}>{EVIDENCE[e.evidenceStatus] ?? e.evidenceStatus}</Badge>
              {e.score != null && <span className="text-xs text-muted-foreground">evaluación IA {e.score}/100</span>}
              {e.url && <a className="text-xs underline" href={e.url} target="_blank" rel="noopener noreferrer">enlace</a>}
            </li>
          ))}
        </ul>
      </Section>
      <p className="border-t pt-4 text-xs text-muted-foreground">
        Competencias y evaluaciones generadas con apoyo de IA en una plataforma de aprendizaje por retos. No constituyen una certificación ni una acreditación universitaria oficial.
      </p>
    </article>
  );
}
