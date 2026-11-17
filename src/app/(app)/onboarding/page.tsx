import { redirect } from "next/navigation";
import { Alert, Card } from "@/components/ui/primitives";
import { ProfileForm } from "@/components/app/profile-form";
import { getProfile, requireUser } from "@/server/services/session";
import { saveProfileAction } from "../actions";

export const metadata = { title: "Bienvenida" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, user } = await requireUser();
  const profile = await getProfile(supabase, user.id);
  if (profile?.onboarding_completed_at) redirect("/dashboard");
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold">Bienvenido. Personalicemos tus retos</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">Tres pasos breves. Podrás cambiar todo después desde tu perfil.</p>
      {error && <div className="mb-4"><Alert tone="danger">{error}</Alert></div>}
      <Card>
        <ProfileForm action={saveProfileAction} mode="onboarding" defaults={{ ...profile, full_name: profile?.full_name ?? (user.user_metadata?.full_name as string | undefined) }} />
      </Card>
    </div>
  );
}
