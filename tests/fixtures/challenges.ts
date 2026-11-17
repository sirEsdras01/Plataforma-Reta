/**
 * Fixtures sintéticos con la FORMA de las salidas del LLM, para probar validadores
 * sin red. No son datos reales ni se muestran a usuarios.
 */
import type { ChallengeDesignResult, ChallengeProposal, CurriculumPlan, PlannedModule } from "@/domain/schemas";

export function proposal(overrides: Partial<ChallengeProposal> = {}): ChallengeProposal {
  return {
    title: "Plataforma de predicción de demanda eléctrica",
    executive_summary: "Sistema reproducible que pronostica demanda eléctrica horaria.",
    problem_statement: "Los operadores necesitan pronósticos de demanda para despacho.",
    industry_application: "Operación de redes eléctricas.",
    real_world_context: "La demanda depende de clima, calendario y actividad económica.",
    origin: "industry_inspired",
    competencies: ["Series temporales", "Machine learning"],
    recommended_prerequisites: ["Python básico", "Estadística descriptiva"],
    difficulty: "intermediate",
    duration_weeks_min: 6,
    duration_weeks_max: 10,
    tools: ["Python", "pandas", "scikit-learn"],
    data_sources: [],
    final_product: "Dashboard con pronósticos y métricas.",
    verifiable_deliverables: ["Repositorio", "Reporte técnico"],
    possible_extensions: ["Pronóstico probabilístico"],
    portfolio_value: "Demuestra modelado predictivo con datos reales.",
    why_relevant: "La transición energética requiere pronósticos precisos.",
    what_you_will_demonstrate: "Comparar modelos estadísticos y de ML con métricas.",
    scope_note: "",
    ...overrides,
  };
}

export function design(overrides: Partial<ChallengeDesignResult> = {}): ChallengeDesignResult {
  return {
    intent: {
      summary: "Aprender ML aplicado a energía",
      engineering_areas: ["Ciencia de datos", "Energía"],
      discipline_slugs: ["data-science-math", "energy"],
      target_competencies: ["Series temporales"],
      is_too_broad: false,
      clarifying_questions: [],
    },
    proposals: [proposal()],
    ...overrides,
  };
}

export function plannedModule(overrides: Partial<PlannedModule> = {}): PlannedModule {
  return {
    title: "Definición del problema y adquisición de datos",
    technical_objective: "Definir alcance y obtener un dataset documentado.",
    description: "…",
    competencies: ["Gestión de datos"],
    prerequisites: [],
    activities: ["Revisar fuentes de datos", "Documentar el dataset"],
    tools: ["Python"],
    main_deliverable: "Dataset documentado y notebook de carga",
    acceptance_criteria: ["El dataset tiene diccionario de datos"],
    required_evidence: ["Repositorio con notebook"],
    effort_estimate: "6-10 horas",
    depends_on_positions: [],
    concepts: [
      {
        name: "Estacionariedad",
        slug: "time-series-stationarity",
        why_needed: "Para elegir modelos adecuados.",
        prerequisite_concepts: ["media y varianza"],
        estimated_minutes_min: 20,
        estimated_minutes_max: 40,
        is_fundamental: true,
      },
    ],
    rubric: [
      { id: "correctness", name: "Correctitud técnica", description: "…", weight: 2 },
      { id: "documentation", name: "Documentación", description: "…", weight: 1 },
    ],
    ...overrides,
  };
}

export function plan(n = 5): CurriculumPlan {
  return {
    rationale: "Ruta por fases",
    modules: Array.from({ length: n }, (_, i) => plannedModule({ title: `Módulo ${i + 1}`, depends_on_positions: i === 0 ? [] : [i] })),
  };
}

/** Propuestas de distintas ingenierías (para comprobar que nada asume ciencia de datos). */
export const MULTI_DISCIPLINE: ChallengeProposal[] = [
  proposal({ title: "Brazo robótico de 4 GDL con visión para clasificación", tools: ["ROS 2", "OpenCV"], competencies: ["Cinemática", "Visión"] }),
  proposal({ title: "Monitoreo estructural de un puente peatonal con acelerómetros", tools: ["MATLAB"], competencies: ["Análisis modal"], difficulty: "advanced" }),
  proposal({ title: "Filtrado de señales ECG para detección de arritmias", tools: ["Python", "SciPy"], competencies: ["Procesamiento de señales"] }),
  proposal({ title: "Simulación CFD de un intercambiador de calor compacto", tools: ["OpenFOAM"], competencies: ["CFD"], difficulty: "research", scope_note: "Se limita a flujo laminar 2D." }),
];
