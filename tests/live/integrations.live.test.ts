/**
 * Pruebas de integración EN VIVO contra APIs reales (no se ejecutan en `npm test`).
 * Ejecutar: npm run test:live   (lee .env.local)
 * Cada prueba se omite si falta la credencial que necesita.
 */
import { describe, expect, it } from "vitest";
import { OpenAlexProvider } from "@/server/integrations/providers/openalex";
import { CrossrefProvider } from "@/server/integrations/providers/crossref";
import { ArxivProvider } from "@/server/integrations/providers/arxiv";
import { GitHubProvider } from "@/server/integrations/providers/github";
import { YouTubeProvider } from "@/server/integrations/providers/youtube";
import { AnthropicProvider } from "@/server/ai/providers/anthropic";
import { GeminiProvider } from "@/server/ai/providers/gemini";
import { ChallengeDesignResult, type StudentContext } from "@/domain/schemas";
import { challengeDesignerSystem } from "@/server/ai/prompts";
import { validateChallengeDesign } from "@/server/ai/agents/validators";
import { studentBlock } from "@/server/ai/agents/studentBlock";

const T = 60_000;
const e = process.env;

describe("live: resource providers", () => {
  it("OpenAlex returns normalized works with canonical URLs", { timeout: T }, async () => {
    const r = await new OpenAlexProvider(e.OPENALEX_API_KEY).search("time series stationarity unit root test", { limit: 5 });
    expect(r.length).toBeGreaterThan(0);
    for (const x of r) expect(x.canonicalUrl).toMatch(/^https:\/\//);
  });
  it("Crossref returns DOIs", { timeout: T }, async () => {
    const r = await new CrossrefProvider(e.CONTACT_EMAIL).search("homogeneous transformation robot camera calibration", { limit: 5 });
    expect(r.length).toBeGreaterThan(0);
    expect(r[0]?.doi).toBeTruthy();
  });
  it("arXiv returns preprints", { timeout: T }, async () => {
    const r = await new ArxivProvider().search("electricity load forecasting", { limit: 5 });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.peerReviewed === false)).toBe(true);
  });
  it("GitHub returns repositories", { timeout: T }, async () => {
    const r = await new GitHubProvider(e.GITHUB_TOKEN).search("ecg signal processing", { limit: 5 });
    expect(r.length).toBeGreaterThan(0);
  });
  it.skipIf(!e.YOUTUBE_API_KEY)("YouTube returns embeddable videos with durations", { timeout: T }, async () => {
    const r = await new YouTubeProvider(e.YOUTUBE_API_KEY).search("stationarity time series explained", { limit: 5, language: "es" });
    expect(r.length).toBeGreaterThan(0);
    expect(r[0]?.durationSeconds).toBeGreaterThan(0);
  });
});

const student: StudentContext = {
  programName: "Ingeniería en Ciencia de Datos y Matemáticas",
  institutionName: "Tecnológico de Monterrey",
  academicPeriod: "3er semestre",
  interests: ["energía"],
  priorKnowledge: "Python inicial y estadística básica",
  toolsKnown: ["Python"],
  projectExperience: "academic",
  careerGoals: "Ciencia de datos en el sector energético",
  weeklyHours: 6,
  preferredLanguage: "es",
  hardwareAccess: null,
  demonstratedSkills: [],
};

const GOALS = [
  "Quiero aprender machine learning, análisis de series temporales y modelos predictivos aplicados a problemas energéticos reales",
  "Quiero aprender visión por computadora para crear un robot que detecte objetos, calcule su posición y pueda clasificarlos",
  "Quiero aprender CFD",
  "Quiero aprender procesamiento de señales biomédicas",
  "Quiero diseñar el monitoreo estructural de un puente",
];

const provider = e.AI_PROVIDER === "gemini"
  ? e.GEMINI_API_KEY ? new GeminiProvider({ apiKey: e.GEMINI_API_KEY, model: e.GEMINI_MODEL ?? "gemini-3.8-flash", timeoutMs: 180_000 }) : null
  : e.ANTHROPIC_API_KEY ? new AnthropicProvider({ apiKey: e.ANTHROPIC_API_KEY, model: e.ANTHROPIC_MODEL ?? "claude-opus-5-5", timeoutMs: 180_000, maxRetries: 2, serverFallbacks: "default" }) : null;

describe.skipIf(!provider)("live: challenge designer across engineering disciplines", () => {
  for (const goal of GOALS) {
    it(goal, { timeout: 300_000 }, async () => {
      const res = await provider!.generateObject({
        system: challengeDesignerSystem(),
        messages: [{ role: "user", content: `Perfil:\n${studentBlock(student)}\n\nObjetivo:\n${goal}` }],
        schema: ChallengeDesignResult,
        schemaName: "challenge_design",
        effort: "medium",
        maxTokens: 16000,
      });
      expect(validateChallengeDesign(res.data)).toBeNull();
      console.log(`[${goal.slice(0, 40)}…] →`, res.data.proposals.map((p) => p.title), res.usage);
    });
  }
});
