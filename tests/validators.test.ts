import { describe, expect, it } from "vitest";
import {
  decideOutcome,
  validateChallengeDesign,
  validateCurriculum,
  validateEvaluation,
  validateKnowledgeCard,
  weightedScore,
} from "@/server/ai/agents/validators";
import type { EvidenceEvaluation, KnowledgeCardDraft, RubricCriterion } from "@/domain/schemas";
import { design, MULTI_DISCIPLINE, plan, plannedModule, proposal } from "./fixtures/challenges";

describe("validateChallengeDesign", () => {
  it("accepts a well-formed design", () => {
    expect(validateChallengeDesign(design())).toBeNull();
  });
  it("accepts proposals from several engineering disciplines", () => {
    expect(validateChallengeDesign(design({ proposals: MULTI_DISCIPLINE.slice(0, 3) }))).toBeNull();
    expect(validateChallengeDesign(design({ proposals: [MULTI_DISCIPLINE[3]!] }))).toBeNull();
  });
  it("requires three alternatives when the goal is too broad", () => {
    const d = design();
    d.intent.is_too_broad = true;
    expect(validateChallengeDesign(d)).toMatch(/tres alternativas/);
  });
  it("rejects more than two clarifying questions", () => {
    const d = design();
    d.intent.clarifying_questions = ["a", "b", "c"];
    expect(validateChallengeDesign(d)).toMatch(/dos preguntas/);
  });
  it("rejects inverted duration ranges", () => {
    expect(validateChallengeDesign(design({ proposals: [proposal({ duration_weeks_min: 8, duration_weeks_max: 4 })] }))).toMatch(/duración/);
  });
  it("rejects non-https data source URLs", () => {
    const p = proposal({ data_sources: [{ name: "x", url: "http://example.org", verification: "unverified_suggestion" }] });
    expect(validateChallengeDesign(design({ proposals: [p] }))).toMatch(/https/);
  });
  it("rejects proposals without verifiable deliverables", () => {
    expect(validateChallengeDesign(design({ proposals: [proposal({ verifiable_deliverables: [] })] }))).toMatch(/entregables/);
  });
});

describe("validateCurriculum", () => {
  it("accepts 4-8 module plans", () => {
    expect(validateCurriculum(plan(4))).toBeNull();
    expect(validateCurriculum(plan(7))).toBeNull();
  });
  it("rejects too many modules", () => {
    expect(validateCurriculum(plan(9))).toMatch(/entre 3 y 8/);
  });
  it("rejects forward dependencies", () => {
    const p = plan(4);
    p.modules[1] = plannedModule({ depends_on_positions: [3] });
    expect(validateCurriculum(p)).toMatch(/posición inválida/);
  });
  it("requires at least one concept per module (knowledge gap analysis)", () => {
    const p = plan(4);
    p.modules[0] = plannedModule({ concepts: [] });
    expect(validateCurriculum(p)).toMatch(/conocimientos/);
  });
  it("rejects invalid concept slugs", () => {
    const p = plan(4);
    p.modules[0] = plannedModule({ concepts: [{ ...plannedModule().concepts[0]!, slug: "Not A Slug" }] });
    expect(validateCurriculum(p)).toMatch(/Slug/);
  });
  it("rejects duplicate rubric ids", () => {
    const p = plan(4);
    p.modules[0] = plannedModule({ rubric: [{ id: "a", name: "A", description: "", weight: 1 }, { id: "a", name: "B", description: "", weight: 1 }] });
    expect(validateCurriculum(p)).toMatch(/duplicados/);
  });
});

function card(ids: string[]): KnowledgeCardDraft {
  return {
    concept: "Estacionariedad",
    why_you_need_it: "…",
    estimated_minutes_min: 20,
    estimated_minutes_max: 30,
    explanation_markdown: "…",
    worked_example_markdown: "…",
    selected_resources: ids.map((id) => ({ candidate_id: id, reason: "r", how_to_use: "completo", confidence: "medium" as const })),
    practice: { prompt: "p", expected_output_kind: "code", verification_criteria: ["c"], hints: [] },
    limitations: "",
  };
}

describe("validateKnowledgeCard (anti-fabrication)", () => {
  const candidates = new Set(["c1", "c2", "c3"]);
  it("accepts selections from the candidate list", () => {
    expect(validateKnowledgeCard(card(["c1", "c3"]), candidates)).toBeNull();
  });
  it("rejects any candidate id not returned by a provider", () => {
    expect(validateKnowledgeCard(card(["c1", "c99"]), candidates)).toMatch(/no existe/);
  });
  it("allows an empty selection only when there were no candidates", () => {
    expect(validateKnowledgeCard(card([]), new Set())).toBeNull();
    expect(validateKnowledgeCard(card([]), candidates)).toMatch(/al menos un recurso/);
  });
  it("rejects duplicates", () => {
    expect(validateKnowledgeCard(card(["c1", "c1"]), candidates)).toMatch(/duplicados/);
  });
});

const rubric: RubricCriterion[] = [
  { id: "correctness", name: "C", description: "", weight: 3 },
  { id: "docs", name: "D", description: "", weight: 1 },
];
function evaluation(scores: [string, number, boolean][], outcome: EvidenceEvaluation["outcome"] = "accepted"): EvidenceEvaluation {
  return {
    criterion_scores: scores.map(([criterion_id, score, evidence_inspected]) => ({ criterion_id, score, justification: "", evidence_inspected })),
    outcome,
    strengths: [],
    improvements: [],
    summary: "",
    demonstrated_competencies: [],
  };
}

describe("evaluation rules", () => {
  it("requires every rubric criterion to be scored", () => {
    expect(validateEvaluation(evaluation([["correctness", 80, true]]), rubric)).toMatch(/docs/);
    expect(validateEvaluation(evaluation([["correctness", 80, true], ["docs", 70, true], ["x", 1, true]]), rubric)).toMatch(/desconocido/);
  });
  it("computes the weighted score", () => {
    expect(weightedScore(evaluation([["correctness", 80, true], ["docs", 40, true]]), rubric)).toBe(70);
  });
  it("accepts only when the model accepts AND the platform threshold is met", () => {
    expect(decideOutcome(evaluation([["correctness", 90, true], ["docs", 80, true]]), rubric, 70)).toBe("accepted");
    expect(decideOutcome(evaluation([["correctness", 60, true], ["docs", 60, true]]), rubric, 70)).toBe("needs_changes");
    expect(decideOutcome(evaluation([["correctness", 90, true], ["docs", 90, true]], "needs_changes"), rubric, 70)).toBe("needs_changes");
  });
  it("never accepts when most of the weight lacks inspected evidence", () => {
    expect(decideOutcome(evaluation([["correctness", 95, false], ["docs", 95, true]]), rubric, 70)).toBe("insufficient_evidence");
  });
});
