/**
 * Esquemas de dominio validados con Zod.
 *
 * Estos esquemas son el contrato entre la capa de IA y el resto del sistema:
 * toda salida de un LLM se valida contra ellos antes de persistirse.
 * Se mantienen deliberadamente "planos" (objetos, arrays, enums, strings, números)
 * porque ambos proveedores (Claude y Gemini) soportan ese subconjunto de JSON Schema
 * en sus modos de salida estructurada.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Enumeraciones compartidas
// ---------------------------------------------------------------------------
export const Difficulty = z.enum(["introductory", "intermediate", "advanced", "research"]);
export type Difficulty = z.infer<typeof Difficulty>;

export const ChallengeOrigin = z.enum(["ai_generated", "industry_inspired"]);

export const ModuleStatus = z.enum([
  "pending",
  "preparing",
  "in_progress",
  "in_review",
  "completed",
  "needs_changes",
]);
export type ModuleStatus = z.infer<typeof ModuleStatus>;

export const ConceptStatus = z.enum(["pending", "studying", "practicing", "mastered", "skipped_known"]);
export type ConceptStatus = z.infer<typeof ConceptStatus>;

export const EvidenceStatus = z.enum(["received", "analyzed", "verified", "pending_review"]);
export type EvidenceStatus = z.infer<typeof EvidenceStatus>;

// ---------------------------------------------------------------------------
// Onboarding / perfil (entrada del usuario)
// ---------------------------------------------------------------------------
const csvList = z
  .string()
  .max(1000)
  .transform((s) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 30),
  );

export const ProfileInput = z.object({
  full_name: z.string().trim().min(2).max(120),
  institution_name: z.string().trim().min(2).max(200),
  program_name: z.string().trim().min(2).max(200),
  academic_period: z.string().trim().max(60).optional().default(""),
  interests: csvList,
  prior_knowledge: z.string().trim().max(2000).optional().default(""),
  tools_known: csvList,
  project_experience: z.enum(["none", "academic", "personal", "professional", "research"]),
  career_goals: z.string().trim().max(2000).optional().default(""),
  weekly_hours: z.coerce.number().int().min(0).max(80),
  preferred_language: z.enum(["es", "en", "pt", "fr", "de"]).default("es"),
  hardware_access: z.string().trim().max(1000).optional().default(""),
});
export type ProfileInput = z.infer<typeof ProfileInput>;

/** Perfil que se envía a la IA (sin identificadores ni datos de contacto). */
export interface StudentContext {
  programName: string | null;
  institutionName: string | null;
  academicPeriod: string | null;
  interests: string[];
  priorKnowledge: string | null;
  toolsKnown: string[];
  projectExperience: string | null;
  careerGoals: string | null;
  weeklyHours: number | null;
  preferredLanguage: string;
  hardwareAccess: string | null;
  demonstratedSkills: string[];
}

export const GoalInput = z.object({
  goal: z.string().trim().min(8, "Describe un poco más lo que quieres aprender o construir.").max(2000),
  clarification: z.string().trim().max(2000).optional(),
});

// ---------------------------------------------------------------------------
// Intent Analyzer + Challenge Designer
// ---------------------------------------------------------------------------
export const IntentAnalysis = z.object({
  summary: z.string().describe("Qué quiere aprender o construir el estudiante, en una frase."),
  engineering_areas: z.array(z.string()).describe("Áreas o disciplinas de ingeniería involucradas."),
  discipline_slugs: z
    .array(z.string())
    .describe("Slugs kebab-case de disciplinas (existentes o nuevas propuestas)."),
  target_competencies: z.array(z.string()),
  is_too_broad: z.boolean(),
  clarifying_questions: z
    .array(z.string())
    .describe("Máximo dos preguntas, solo si son imprescindibles. Vacío si no hacen falta."),
});
export type IntentAnalysis = z.infer<typeof IntentAnalysis>;

export const DataSourceMention = z.object({
  name: z.string(),
  url: z.string().describe("URL pública conocida o cadena vacía si no estás seguro."),
  verification: z
    .enum(["well_known_public_source", "unverified_suggestion"])
    .describe("Usa unverified_suggestion si no tienes certeza de que exista exactamente así."),
});

export const ChallengeProposal = z.object({
  title: z.string(),
  executive_summary: z.string(),
  problem_statement: z.string(),
  industry_application: z.string(),
  real_world_context: z.string(),
  origin: ChallengeOrigin.describe(
    "industry_inspired si se inspira en un problema industrial real; nunca afirmes que una organización lo publicó.",
  ),
  competencies: z.array(z.string()),
  recommended_prerequisites: z.array(z.string()),
  difficulty: Difficulty,
  duration_weeks_min: z.number().int(),
  duration_weeks_max: z.number().int(),
  tools: z.array(z.string()),
  data_sources: z.array(DataSourceMention),
  final_product: z.string(),
  verifiable_deliverables: z.array(z.string()),
  possible_extensions: z.array(z.string()),
  portfolio_value: z.string(),
  why_relevant: z.string(),
  what_you_will_demonstrate: z.string(),
  scope_note: z
    .string()
    .describe("Si la petición era muy avanzada, explica el alcance viable propuesto. Si no aplica, cadena vacía."),
});
export type ChallengeProposal = z.infer<typeof ChallengeProposal>;

export const ChallengeDesignResult = z.object({
  intent: IntentAnalysis,
  proposals: z.array(ChallengeProposal).describe("Entre una y tres propuestas."),
});
export type ChallengeDesignResult = z.infer<typeof ChallengeDesignResult>;

// ---------------------------------------------------------------------------
// Curriculum Planner
// ---------------------------------------------------------------------------
export const RubricLevel = z.object({
  label: z.string(),
  description: z.string(),
});

export const RubricCriterion = z.object({
  id: z.string().describe("Identificador corto snake_case."),
  name: z.string(),
  description: z.string(),
  weight: z.number().describe("Peso relativo; los pesos se normalizan."),
});
export type RubricCriterion = z.infer<typeof RubricCriterion>;

export const PlannedConcept = z.object({
  name: z.string(),
  slug: z.string().describe("kebab-case, en inglés, estable: p.ej. time-series-stationarity"),
  why_needed: z.string(),
  prerequisite_concepts: z.array(z.string()),
  estimated_minutes_min: z.number().int(),
  estimated_minutes_max: z.number().int(),
  is_fundamental: z.boolean(),
});
export type PlannedConcept = z.infer<typeof PlannedConcept>;

export const PlannedModule = z.object({
  title: z.string(),
  technical_objective: z.string(),
  description: z.string(),
  competencies: z.array(z.string()),
  prerequisites: z.array(z.string()),
  activities: z.array(z.string()),
  tools: z.array(z.string()),
  main_deliverable: z.string(),
  acceptance_criteria: z.array(z.string()),
  required_evidence: z.array(z.string()),
  effort_estimate: z.string().describe("Rango, p.ej. '6-10 horas'."),
  depends_on_positions: z.array(z.number().int()).describe("Posiciones (1-based) de módulos previos requeridos."),
  concepts: z.array(PlannedConcept),
  rubric: z.array(RubricCriterion),
});
export type PlannedModule = z.infer<typeof PlannedModule>;

export const CurriculumPlan = z.object({
  rationale: z.string(),
  modules: z.array(PlannedModule).describe("Entre 4 y 8 módulos cuando el alcance lo permita."),
});
export type CurriculumPlan = z.infer<typeof CurriculumPlan>;

// ---------------------------------------------------------------------------
// Research Agent + Knowledge card
// ---------------------------------------------------------------------------
export const SearchPlan = z.object({
  concept_definition: z.string(),
  queries: z.array(
    z.object({
      provider: z.enum(["youtube", "openalex", "crossref", "arxiv", "github"]),
      query: z.string(),
    }),
  ),
});
export type SearchPlan = z.infer<typeof SearchPlan>;

export const ResourceSelection = z.object({
  candidate_id: z.string().describe("ID exacto de un candidato de la lista. Nunca inventes IDs."),
  reason: z.string(),
  how_to_use: z
    .string()
    .describe("Qué parte estudiar. Solo menciona secciones/minutos si aparecen en los metadatos proporcionados."),
  confidence: z.enum(["high", "medium", "low"]),
});

export const KnowledgeCardDraft = z.object({
  concept: z.string(),
  why_you_need_it: z.string(),
  estimated_minutes_min: z.number().int(),
  estimated_minutes_max: z.number().int(),
  explanation_markdown: z.string(),
  worked_example_markdown: z.string(),
  selected_resources: z.array(ResourceSelection),
  practice: z.object({
    prompt: z.string(),
    expected_output_kind: z.enum(["code", "numeric", "short_text", "derivation", "explanation"]),
    verification_criteria: z.array(z.string()),
    hints: z.array(z.string()),
  }),
  limitations: z.string().describe("Qué no se pudo verificar sobre las fuentes. Cadena vacía si nada."),
});
export type KnowledgeCardDraft = z.infer<typeof KnowledgeCardDraft>;

// ---------------------------------------------------------------------------
// Práctica, evaluación, portafolio
// ---------------------------------------------------------------------------
export const PracticeFeedback = z.object({
  passed: z.boolean(),
  criteria_results: z.array(z.object({ criterion: z.string(), met: z.boolean(), comment: z.string() })),
  feedback_markdown: z.string(),
  misconceptions: z.array(z.string()),
});
export type PracticeFeedback = z.infer<typeof PracticeFeedback>;

export const EvidenceEvaluation = z.object({
  criterion_scores: z.array(
    z.object({
      criterion_id: z.string(),
      score: z.number().describe("0 a 100"),
      justification: z.string(),
      evidence_inspected: z.boolean().describe("true solo si el contenido inspeccionado respalda la puntuación."),
    }),
  ),
  outcome: z.enum(["accepted", "needs_changes", "insufficient_evidence"]),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  summary: z.string(),
  demonstrated_competencies: z.array(z.string()),
});
export type EvidenceEvaluation = z.infer<typeof EvidenceEvaluation>;

export const PortfolioContent = z.object({
  title: z.string(),
  executive_summary: z.string(),
  problem: z.string(),
  objectives: z.array(z.string()),
  methodology: z.string(),
  technologies: z.array(z.string()),
  architecture: z.string(),
  results: z.string(),
  metrics: z.array(z.string()),
  limitations: z.array(z.string()),
  learnings: z.array(z.string()),
  competencies: z.array(z.string()),
  repository_url: z.string(),
  demo_url: z.string(),
});
export type PortfolioContent = z.infer<typeof PortfolioContent>;

export const TutorRequest = z.object({
  projectId: z.string().uuid(),
  moduleId: z.string().uuid(),
  moduleConceptId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(8000),
  helpLevel: z.number().int().min(1).max(5).optional(),
});
export type TutorRequest = z.infer<typeof TutorRequest>;
