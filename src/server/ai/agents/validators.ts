/**
 * Validaciones semánticas de las salidas de los agentes (además del esquema Zod).
 * Son funciones puras para poder probarlas sin red.
 */
import type {
  ChallengeDesignResult,
  CurriculumPlan,
  EvidenceEvaluation,
  KnowledgeCardDraft,
  RubricCriterion,
} from "@/domain/schemas";

export function validateChallengeDesign(r: ChallengeDesignResult): string | null {
  if (r.proposals.length < 1 || r.proposals.length > 3) return "Debe haber entre 1 y 3 propuestas.";
  if (r.intent.clarifying_questions.length > 2) return "Máximo dos preguntas de aclaración.";
  if (r.intent.is_too_broad && r.proposals.length < 3) return "Si el objetivo es muy general, presenta tres alternativas.";
  for (const p of r.proposals) {
    if (p.duration_weeks_min < 1 || p.duration_weeks_max < p.duration_weeks_min)
      return `Rango de duración inválido en "${p.title}".`;
    if (p.verifiable_deliverables.length === 0) return `"${p.title}" no tiene entregables verificables.`;
    if (p.competencies.length === 0) return `"${p.title}" no declara competencias.`;
    for (const d of p.data_sources) {
      if (d.url && !/^https:\/\//.test(d.url)) return `La fuente "${d.name}" debe usar https o dejar la URL vacía.`;
    }
  }
  return null;
}

export function validateCurriculum(plan: CurriculumPlan): string | null {
  const n = plan.modules.length;
  if (n < 3 || n > 8) return "La ruta debe tener entre 3 y 8 módulos (preferentemente 4-8).";
  for (const [i, m] of plan.modules.entries()) {
    const pos = i + 1;
    if (!m.main_deliverable.trim()) return `El módulo ${pos} no tiene entregable.`;
    if (m.acceptance_criteria.length === 0) return `El módulo ${pos} no tiene criterios de aceptación.`;
    if (m.concepts.length === 0) return `El módulo ${pos} no identifica conocimientos necesarios.`;
    if (m.rubric.length < 2) return `El módulo ${pos} necesita al menos 2 criterios de rúbrica.`;
    if (new Set(m.rubric.map((c) => c.id)).size !== m.rubric.length) return `IDs de rúbrica duplicados en módulo ${pos}.`;
    if (m.rubric.some((c) => !(c.weight > 0))) return `Pesos de rúbrica no positivos en módulo ${pos}.`;
    for (const d of m.depends_on_positions) {
      if (d < 1 || d >= pos) return `El módulo ${pos} depende de una posición inválida (${d}).`;
    }
    for (const c of m.concepts) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.slug)) return `Slug inválido: ${c.slug}`;
      if (c.estimated_minutes_min < 1 || c.estimated_minutes_max < c.estimated_minutes_min)
        return `Rango de minutos inválido para ${c.slug}.`;
    }
  }
  return null;
}

export function validateKnowledgeCard(card: KnowledgeCardDraft, candidateIds: ReadonlySet<string>): string | null {
  if (candidateIds.size > 0 && card.selected_resources.length === 0) return "Selecciona al menos un recurso de la lista.";
  if (card.selected_resources.length > 4) return "Selecciona como máximo 4 recursos.";
  for (const s of card.selected_resources) {
    if (!candidateIds.has(s.candidate_id)) return `El candidate_id "${s.candidate_id}" no existe en la lista. Usa solo IDs dados.`;
  }
  if (new Set(card.selected_resources.map((s) => s.candidate_id)).size !== card.selected_resources.length)
    return "Recursos duplicados.";
  if (card.practice.verification_criteria.length === 0) return "La práctica necesita criterios de verificación.";
  if (card.estimated_minutes_max < card.estimated_minutes_min) return "Rango de minutos inválido.";
  return null;
}

export function validateEvaluation(ev: EvidenceEvaluation, rubric: RubricCriterion[]): string | null {
  const ids = new Set(rubric.map((c) => c.id));
  const got = new Set(ev.criterion_scores.map((c) => c.criterion_id));
  for (const id of ids) if (!got.has(id)) return `Falta puntuar el criterio "${id}".`;
  for (const c of ev.criterion_scores) {
    if (!ids.has(c.criterion_id)) return `Criterio desconocido "${c.criterion_id}".`;
    if (c.score < 0 || c.score > 100) return `Puntuación fuera de rango en "${c.criterion_id}".`;
  }
  return null;
}

/** Puntuación global ponderada (0-100) a partir de la rúbrica. */
export function weightedScore(ev: EvidenceEvaluation, rubric: RubricCriterion[]): number {
  const total = rubric.reduce((s, c) => s + c.weight, 0);
  if (total <= 0) return 0;
  const byId = new Map(ev.criterion_scores.map((c) => [c.criterion_id, c.score]));
  const score = rubric.reduce((s, c) => s + (byId.get(c.id) ?? 0) * c.weight, 0) / total;
  return Math.round(score * 100) / 100;
}

/**
 * Resultado final: la plataforma, no el modelo, decide la aceptación.
 * Se acepta solo si el modelo dijo "accepted", la nota ponderada supera el umbral
 * y la mayoría del peso se apoyó en evidencia realmente inspeccionada.
 */
export function decideOutcome(
  ev: EvidenceEvaluation,
  rubric: RubricCriterion[],
  passingScore: number,
): "accepted" | "needs_changes" | "insufficient_evidence" {
  const total = rubric.reduce((s, c) => s + c.weight, 0) || 1;
  const inspected = new Map(ev.criterion_scores.map((c) => [c.criterion_id, c.evidence_inspected]));
  const inspectedWeight = rubric.reduce((s, c) => s + (inspected.get(c.id) ? c.weight : 0), 0) / total;
  if (ev.outcome === "insufficient_evidence" || inspectedWeight < 0.5) return "insufficient_evidence";
  if (ev.outcome === "accepted" && weightedScore(ev, rubric) >= passingScore) return "accepted";
  return "needs_changes";
}
