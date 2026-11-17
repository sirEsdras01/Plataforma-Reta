import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Simula Supabase service-role: cuenta de uso + inserción de logs.
const inserted: Record<string, unknown>[] = [];
let usageCount = 0;
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        inserted.push(row);
        return { error: null };
      },
      select: () => ({ eq: () => ({ gte: async () => ({ count: usageCount, error: null }) }) }),
    }),
  }),
}));

import { runStructured, setProviderForTests } from "@/server/ai/client";
import { AIError, type LLMProvider } from "@/server/ai/types";

const Schema = z.object({ n: z.number() });

function fakeProvider(outputs: Array<{ n: number } | Error>): LLMProvider & { calls: number } {
  const p = {
    id: "anthropic" as const,
    model: "claude-opus-5-5",
    calls: 0,
    async generateObject<T>() {
      const o = outputs[p.calls++];
      if (o instanceof Error) throw o;
      return { data: o as T, usage: { inputTokens: 100, outputTokens: 50, cachedInputTokens: 0 }, model: "claude-opus-5-5" };
    },
    streamText() {
      throw new Error("not used");
    },
  };
  return p;
}

const base = { userId: "u1", prompt: { id: "test", version: "test@1" }, system: "s", messages: [{ role: "user" as const, content: "x" }], schema: Schema, schemaName: "t" };

describe("runStructured", () => {
  beforeEach(() => {
    inserted.length = 0;
    usageCount = 0;
    process.env.AI_HOURLY_REQUEST_LIMIT = "5";
  });

  it("returns validated data and logs tokens + estimated cost", async () => {
    setProviderForTests(fakeProvider([{ n: 1 }]));
    await expect(runStructured(base)).resolves.toEqual({ n: 1 });
    expect(inserted[0]).toMatchObject({ operation: "test", prompt_version: "test@1", status: "ok", input_tokens: 100, output_tokens: 50 });
    expect(inserted[0]?.estimated_cost_usd).toBeCloseTo(0.0014, 6);
  });

  it("retries once when the semantic validator rejects the output", async () => {
    const p = fakeProvider([{ n: -1 }, { n: 2 }]);
    setProviderForTests(p);
    const out = await runStructured({ ...base, validate: (d) => (d.n < 0 ? "n must be positive" : null) });
    expect(out).toEqual({ n: 2 });
    expect(p.calls).toBe(2);
    expect(inserted.map((r) => r.status)).toEqual(["validation_error", "ok"]);
  });

  it("does not retry provider errors that are not validation failures", async () => {
    const p = fakeProvider([new AIError("refused", "no")]);
    setProviderForTests(p);
    await expect(runStructured(base)).rejects.toMatchObject({ code: "refused" });
    expect(p.calls).toBe(1);
  });

  it("enforces the per-user hourly limit before calling the model", async () => {
    const p = fakeProvider([{ n: 1 }]);
    setProviderForTests(p);
    usageCount = 5;
    await expect(runStructured(base)).rejects.toMatchObject({ code: "rate_limited" });
    expect(p.calls).toBe(0);
  });
});
