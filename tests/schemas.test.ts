import { describe, expect, it } from "vitest";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  ChallengeDesignResult,
  CurriculumPlan,
  EvidenceEvaluation,
  KnowledgeCardDraft,
  PortfolioContent,
  PracticeFeedback,
  ProfileInput,
  SearchPlan,
} from "@/domain/schemas";

const LLM_SCHEMAS = { ChallengeDesignResult, CurriculumPlan, SearchPlan, KnowledgeCardDraft, PracticeFeedback, EvidenceEvaluation, PortfolioContent };

describe("LLM output schemas", () => {
  for (const [name, schema] of Object.entries(LLM_SCHEMAS)) {
    it(`${name} converts to JSON Schema for both providers`, () => {
      // Gemini: responseJsonSchema
      const js = z.toJSONSchema(schema, { target: "draft-2020-12" }) as { type?: string };
      expect(js.type).toBe("object");
      // Claude: output_config.format via SDK helper
      expect(() => betaZodOutputFormat(schema as never)).not.toThrow();
    });
  }
});

describe("ProfileInput", () => {
  it("splits comma lists and coerces numbers", () => {
    const p = ProfileInput.parse({
      full_name: "Ana",
      institution_name: "Tec",
      program_name: "IMT",
      interests: "robótica, energía, ",
      tools_known: "Python,MATLAB",
      project_experience: "academic",
      weekly_hours: "8",
    });
    expect(p.interests).toEqual(["robótica", "energía"]);
    expect(p.weekly_hours).toBe(8);
    expect(p.preferred_language).toBe("es");
  });
  it("rejects out-of-range hours", () => {
    expect(ProfileInput.safeParse({ full_name: "Ana", institution_name: "Tec", program_name: "IMT", interests: "", tools_known: "", project_experience: "none", weekly_hours: 200 }).success).toBe(false);
  });
});
