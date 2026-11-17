"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/server/env";

const Provider = z.enum(["google", "azure"]);

function safeNext(n: FormDataEntryValue | null): string {
  return typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
}

/** Inicia OAuth (PKCE) con Google o Microsoft (Azure AD / Entra ID) vía Supabase Auth. */
export async function signInWithProvider(formData: FormData) {
  const provider = Provider.parse(formData.get("provider"));
  const next = safeNext(formData.get("next"));
  const origin = env().NEXT_PUBLIC_SITE_URL ?? (await headers()).get("origin") ?? "http://localhost:3000";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      // Microsoft requiere el scope 'email' para devolver el correo del usuario.
      scopes: provider === "azure" ? "email openid profile" : undefined,
    },
  });
  if (error || !data.url) redirect(`/login?error=${encodeURIComponent("No se pudo iniciar sesión con el proveedor. ¿Está habilitado en Supabase?")}`);
  redirect(data.url);
}
