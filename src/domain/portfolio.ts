import type { PortfolioContent } from "./schemas";

export interface PortfolioEvidence {
  moduleTitle: string;
  deliverable: string;
  evidenceStatus: string;
  outcome: string | null;
  score: number | null;
  url: string | null;
}

const EVIDENCE_LABEL: Record<string, string> = {
  received: "Evidencia recibida",
  analyzed: "Evidencia analizada",
  verified: "Resultado verificado",
  pending_review: "Pendiente de revisión",
};

/** Genera un README.md para GitHub a partir del contenido del portafolio. */
export function portfolioToReadme(c: PortfolioContent, evidences: PortfolioEvidence[]): string {
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : "_No reportado._");
  const lines = [
    `# ${c.title}`,
    "",
    c.executive_summary,
    "",
    "## Problema",
    c.problem,
    "",
    "## Objetivos",
    list(c.objectives),
    "",
    "## Metodología",
    c.methodology,
    "",
    "## Arquitectura",
    c.architecture,
    "",
    "## Tecnologías",
    list(c.technologies),
    "",
    "## Resultados",
    c.results,
    "",
    "### Métricas",
    list(c.metrics),
    "",
    "## Limitaciones",
    list(c.limitations),
    "",
    "## Aprendizajes",
    list(c.learnings),
    "",
    "## Competencias desarrolladas",
    list(c.competencies),
    "",
    "## Evidencias por módulo",
    evidences.length
      ? evidences
          .map(
            (e) =>
              `- **${e.moduleTitle}** — ${e.deliverable} · ${EVIDENCE_LABEL[e.evidenceStatus] ?? e.evidenceStatus}` +
              (e.score != null ? ` · evaluación: ${e.score}/100` : "") +
              (e.url ? ` · [enlace](${e.url})` : ""),
          )
          .join("\n")
      : "_Sin evidencias registradas._",
    "",
  ];
  if (c.repository_url) lines.push(`**Repositorio:** ${c.repository_url}`, "");
  if (c.demo_url) lines.push(`**Demostración:** ${c.demo_url}`, "");
  lines.push(
    "---",
    "_Las competencias y evaluaciones mostradas fueron generadas con apoyo de IA dentro de una plataforma de aprendizaje por retos. No constituyen una certificación ni acreditación universitaria oficial._",
    "",
  );
  return lines.join("\n");
}
