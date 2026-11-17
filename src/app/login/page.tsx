import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Card } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/submit-button";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { signInWithProvider } from "./actions";

export const metadata = { title: "Iniciar sesión" };

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}
function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
      <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
      <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
      <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
    </svg>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  if (!isSupabaseConfigured()) redirect("/setup");
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,var(--accent),transparent_60%)] p-6">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6">
          <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">R</div>
          <h1 className="text-lg font-semibold">Entra a {APP_NAME}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{APP_TAGLINE}.</p>
        </div>
        {error && (
          <div className="mb-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}
        <div className="space-y-2">
          <form action={signInWithProvider}>
            <input type="hidden" name="provider" value="google" />
            <input type="hidden" name="next" value={next ?? "/dashboard"} />
            <SubmitButton variant="outline" className="w-full" pendingText="Redirigiendo…">
              <GoogleIcon /> Continuar con Google
            </SubmitButton>
          </form>
          <form action={signInWithProvider}>
            <input type="hidden" name="provider" value="azure" />
            <input type="hidden" name="next" value={next ?? "/dashboard"} />
            <SubmitButton variant="outline" className="w-full" pendingText="Redirigiendo…">
              <MicrosoftIcon /> Continuar con Microsoft
            </SubmitButton>
          </form>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Al continuar aceptas el tratamiento de tus datos descrito en la <Link className="underline" href="/privacy">política de privacidad</Link>.
        </p>
      </Card>
    </main>
  );
}
