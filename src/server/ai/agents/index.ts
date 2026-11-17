import "server-only";
import {
  ChallengeDesignResult,
  CurriculumPlan,
  EvidenceEvaluation,
  KnowledgeCardDraft,
  PortfolioContent,
  PracticeFeedback,
  SearchPlan,
  type ChallengeProposal,
  type RubricCriterion,
  type StudentContext,
} from "@/domain/schemas";
import { runStructured } from "../client";
import {
  PROMPTS,
  challengeDesignerSystem,
  curriculumPlannerSystem,
  evidenceEvaluatorSystem,
  knowledgeCardSystem,
  portfolioGeneratorSystem,
  practiceGraderSystem,
  researchPlannerSystem,
} from "../prompts";
import { untrusted } from "../untrusted";
import { studentBlock } from "./studentBlock";
export { studentBlock };
import { validateChallengeDesign, validateCurriculum, validateEvaluation, validateKnowledgeCard } from "./validators";

export async function designChallenges(userId: string, student: StudentContext, goal: string, clarification?: string) {
  const content = [
    "Perfil del estudiante:",
    studentBlock(student),
    "Objetivo escrito por el estudiante:",
    untrusted("student_goal", goal, 2000),
    clarification ? `Aclaración del estudiante:\n${untrusted("student_clarification", clarification, 2000)}` : "",
  ].join("\n\n");
  return runStructured({
    userId,
    prompt: PROMPTS.challengeDesigner,
    system: challengeDesignerSystem(),
    messages: [{ role: "user", content }],
    schema: ChallengeDesignResult,
    schemaName: "challenge_design",
    effort: "medium",
    maxTokens: 16000,
    validate: validateChallengeDesign,
  });
}

export async function planCurriculum(userId: string, student: StudentContext, proposal: ChallengeProposal) {
  const content = [
    "Perfil del estudiante:",
    studentBlock(student),
    "Reto aceptado (JSON):",
    JSON.stringify(proposal, null, 2),
  ].join("\n\n");
  return runStructured({
    userId,
    prompt: PROMPTS.curriculumPlanner,
    system: curriculumPlannerSystem(),
    messages: [{ role: "user", content }],
    schema: CurriculumPlan,
    schemaName: "curriculum_plan",
    effort: "medium",
    maxTokens: 32000,
    validate: validateCurriculum,
  });
}

export interface ConceptContext {
  conceptName: string;
  whyNeeded: string;
  projectTitle: string;
  moduleTitle: string;
  moduleObjective: string;
  student: StudentContext;
}

export async function planResearch(userId: string, c: ConceptContext) {
  const content = [
    `Concepto: ${c.conceptName}`,
    `Por qué lo necesita: ${c.whyNeeded}`,
    `Proyecto: ${c.projectTitle}`,
    `Módulo: ${c.moduleTitle} — ${c.moduleObjective}`,
    `Idioma preferido: ${c.student.preferredLanguage}`,
  ].join("\n");
  return runStructured({
    userId,
    prompt: PROMPTS.researchPlanner,
    system: researchPlannerSystem(),
    messages: [{ role: "user", content }],
    schema: SearchPlan,
    schemaName: "search_plan",
    effort: "low",
    maxTokens: 4000,
    validate: (p) => (p.queries.length < 1 || p.queries.length > 8 ? "Entre 1 y 8 consultas." : null),
  });
}

export interface CandidateForLLM {
  id: string;
  provider: string;
  type: string;
  title: string;
  authorsOrChannel: string;
  year: string;
  url: string;
  openAccess: string;
  peerReviewed: string;
  durationMinutes: string;
  description: string;
  verifiedSegments: string[];
}

export async function composeKnowledgeCard(userId: string, c: ConceptContext, candidates: CandidateForLLM[]) {
  const ids = new Set(candidates.map((x) => x.id));
  const list = candidates
    .map((x) =>
      untrusted(
        `candidate:${x.id}`,
        [
          `ID: ${x.id}`,
          `Proveedor: ${x.provider} · Tipo: ${x.type}`,
          `Título: ${x.title}`,
          `Autores/Canal: ${x.authorsOrChannel}`,
          `Año: ${x.year}`,
          `URL: ${x.url}`,
          `Acceso abierto: ${x.openAccess} · Revisado por pares: ${x.peerReviewed}`,
          x.durationMinutes ? `Duración: ${x.durationMinutes} min` : "",
          x.verifiedSegments.length ? `Segmentos verificados: ${x.verifiedSegments.join("; ")}` : "Segmentos verificados: ninguno",
          `Descripción/abstract: ${x.description}`,
        ]
          .filter(Boolean)
          .join("\n"),
        2500,
      ),
    )
    .join("\n");
  const content = [
    `Concepto: ${c.conceptName}`,
    `Por qué lo necesita en el proyecto: ${c.whyNeeded}`,
    `Proyecto: ${c.projectTitle}`,
    `Módulo actual: ${c.moduleTitle} — ${c.moduleObjective}`,
    "Perfil:",
    studentBlock(c.student),
    candidates.length
      ? `Candidatos recuperados (${candidates.length}):\n${list}`
      : "No se recuperaron candidatos de los proveedores (sin credenciales o sin resultados). selected_resources debe ir vacío y debes explicarlo en limitations.",
  ].join("\n\n");
  return runStructured({
    userId,
    prompt: PROMPTS.knowledgeCard,
    system: knowledgeCardSystem(),
    messages: [{ role: "user", content }],
    schema: KnowledgeCardDraft,
    schemaName: "knowledge_card",
    effort: "medium",
    maxTokens: 12000,
    validate: (card) => validateKnowledgeCard(card, ids),
  });
}

export async function gradePractice(
  userId: string,
  input: { concept: string; prompt: string; criteria: string[]; answer: string; language: string },
) {
  const content = [
    `Concepto: ${input.concept}`,
    `Práctica:\n${input.prompt}`,
    `Criterios de verificación:\n- ${input.criteria.join("\n- ")}`,
    `Idioma: ${input.language}`,
    "Respuesta del estudiante:",
    untrusted("student_answer", input.answer, 20000),
  ].join("\n\n");
  return runStructured({
    userId,
    prompt: PROMPTS.practiceGrader,
    system: practiceGraderSystem(),
    messages: [{ role: "user", content }],
    schema: PracticeFeedback,
    schemaName: "practice_feedback",
    effort: "medium",
    maxTokens: 6000,
  });
}

export async function evaluateEvidence(
  userId: string,
  input: {
    projectTitle: string;
    moduleTitle: string;
    deliverable: string;
    acceptanceCriteria: string[];
    rubric: RubricCriterion[];
    inspectedContent: string;
    inspectionNotes: string[];
    language: string;
  },
) {
  const content = [
    `Proyecto: ${input.projectTitle}`,
    `Módulo: ${input.moduleTitle}`,
    `Entregable esperado: ${input.deliverable}`,
    `Criterios de aceptación:\n- ${input.acceptanceCriteria.join("\n- ")}`,
    `Rúbrica (JSON):\n${JSON.stringify(input.rubric, null, 2)}`,
    `Notas de inspección de la plataforma:\n- ${input.inspectionNotes.join("\n- ")}`,
    `Idioma: ${input.language}`,
    "Contenido inspeccionado:",
    untrusted("student_evidence", input.inspectedContent || "(sin contenido inspeccionable)", 60000),
  ].join("\n\n");
  return runStructured({
    userId,
    prompt: PROMPTS.evidenceEvaluator,
    system: evidenceEvaluatorSystem(),
    messages: [{ role: "user", content }],
    schema: EvidenceEvaluation,
    schemaName: "evidence_evaluation",
    effort: "high",
    maxTokens: 12000,
    validate: (ev) => validateEvaluation(ev, input.rubric),
  });
}

export async function generatePortfolio(userId: string, projectDossier: string, language: string) {
  return runStructured({
    userId,
    prompt: PROMPTS.portfolioGenerator,
    system: portfolioGeneratorSystem(),
    messages: [
      { role: "user", content: `Idioma: ${language}\n\nExpediente del proyecto:\n${untrusted("project_dossier", projectDossier, 80000)}` },
    ],
    schema: PortfolioContent,
    schemaName: "portfolio",
    effort: "medium",
    maxTokens: 12000,
  });
}
