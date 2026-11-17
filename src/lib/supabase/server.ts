import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/server/env";

export class ConfigPendingError extends Error {
  constructor(what: string) {
    super(`Configuración pendiente: ${what}`);
    this.name = "ConfigPendingError";
  }
}

export function isSupabaseConfigured(): boolean {
  const e = env();
  return !!(e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Cliente con la sesión del usuario (cookies). Todas las lecturas/escrituras
 * pasan por RLS: el usuario solo ve sus propias filas.
 */
export async function createClient(): Promise<SupabaseClient> {
  // Leer cookies primero marca la ruta como dinámica (nunca se prerenderiza con datos de sesión).
  const cookieStore = await cookies();
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new ConfigPendingError("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createServerClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Llamado desde un Server Component: el proxy refresca la sesión.
        }
      },
    },
  });
}

let admin: SupabaseClient | undefined;

/**
 * Cliente service-role. SOLO para escrituras que el estudiante no debe poder
 * falsificar (evaluaciones, intentos de práctica, evidencias, catálogos, uso de IA)
 * y siempre después de comprobar la propiedad con `createClient()`.
 */
export function createAdminClient(): SupabaseClient {
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ConfigPendingError("SUPABASE_SERVICE_ROLE_KEY");
  }
  admin ??= createSupabaseClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
