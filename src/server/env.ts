import "server-only";
import { z } from "zod";

/**
 * Variables de entorno del servidor. Nunca se exponen al cliente (sin prefijo NEXT_PUBLIC_).
 * Las credenciales son opcionales a nivel de esquema para que la app arranque y muestre
 * un estado de "configuración pendiente" en lugar de fallar al iniciar.
 */
const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

const ServerEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optionalString,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  NEXT_PUBLIC_SITE_URL: optionalString,

  AI_PROVIDER: z.enum(["anthropic", "gemini"]).default("anthropic"),
  ANTHROPIC_API_KEY: optionalString,
  // Verificado en la documentación oficial de Anthropic (2026-11-17). Configurable.
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  // Reintento del lado del servidor ante rechazos de política ("default" | "off").
  ANTHROPIC_SERVER_FALLBACKS: z.enum(["default", "off"]).default("default"),
  GEMINI_API_KEY: optionalString,
  // Verificado en ai.google.dev/gemini-api/docs/models (2026-11-17). Configurable.
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  GEMINI_EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),

  AI_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(600_000).default(120_000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(4).default(2),
  AI_HOURLY_REQUEST_LIMIT: z.coerce.number().int().min(1).default(60),
  // JSON opcional: {"modelo": {"input": usd_por_millon, "output": usd_por_millon}}
  AI_PRICING_JSON: optionalString,

  YOUTUBE_API_KEY: optionalString,
  OPENALEX_API_KEY: optionalString,
  // Correo de contacto para el "polite pool" de Crossref/OpenAlex (opcional).
  CONTACT_EMAIL: optionalString,
  GITHUB_TOKEN: optionalString,
});

export type ServerEnv = z.infer<typeof ServerEnv>;

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (!cached) cached = ServerEnv.parse(process.env);
  return cached;
}

/** Solo para pruebas. */
export function resetEnvCache() {
  cached = undefined;
}

export interface ConfigStatusItem {
  key: string;
  label: string;
  configured: boolean;
  required: boolean;
  howTo: string;
}

/** Estado de configuración visible en /settings (sin revelar valores). */
export function configStatus(): ConfigStatusItem[] {
  const e = env();
  const aiKeyConfigured = e.AI_PROVIDER === "anthropic" ? !!e.ANTHROPIC_API_KEY : !!e.GEMINI_API_KEY;
  return [
    {
      key: "supabase",
      label: "Supabase (Auth, base de datos, almacenamiento)",
      configured: !!(e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_ANON_KEY && e.SUPABASE_SERVICE_ROLE_KEY),
      required: true,
      howTo: "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY (SETUP.md §2).",
    },
    {
      key: "ai",
      label: `Proveedor de IA (${e.AI_PROVIDER === "anthropic" ? `Claude · ${e.ANTHROPIC_MODEL}` : `Gemini · ${e.GEMINI_MODEL}`})`,
      configured: aiKeyConfigured,
      required: true,
      howTo:
        e.AI_PROVIDER === "anthropic"
          ? "ANTHROPIC_API_KEY (console.anthropic.com → API Keys)."
          : "GEMINI_API_KEY (aistudio.google.com → Get API key).",
    },
    {
      key: "youtube",
      label: "YouTube Data API v3",
      configured: !!e.YOUTUBE_API_KEY,
      required: false,
      howTo: "YOUTUBE_API_KEY (Google Cloud Console → habilitar YouTube Data API v3 → credenciales).",
    },
    {
      key: "openalex",
      label: "OpenAlex (funciona sin clave; la clave amplía la cuota)",
      configured: true,
      required: false,
      howTo: "OPENALEX_API_KEY opcional (openalex.org → cuenta → API key).",
    },
    {
      key: "crossref",
      label: "Crossref (sin clave)",
      configured: true,
      required: false,
      howTo: "CONTACT_EMAIL opcional para el polite pool.",
    },
    {
      key: "arxiv",
      label: "arXiv (sin clave)",
      configured: true,
      required: false,
      howTo: "No requiere credenciales.",
    },
    {
      key: "github",
      label: "GitHub REST API (sin token: 10 búsquedas/min; con token: 30/min)",
      configured: true,
      required: false,
      howTo: "GITHUB_TOKEN opcional (fine-grained token de solo lectura a repos públicos).",
    },
  ];
}
