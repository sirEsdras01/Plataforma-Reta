import { Alert, Badge, Card, CardTitle, PageHeader } from "@/components/ui/primitives";
import { ProfileForm } from "@/components/app/profile-form";
import { requireOnboardedUser } from "@/server/services/session";
import { saveProfileAction } from "../actions";

export const metadata = { title: "Perfil y competencias" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { error, saved } = await searchParams;
  const { supabase, user, profile } = await requireOnboardedUser();
  const { data: skills } = await supabase.from("user_skills").select("skill_name, source, created_at").eq("user_id", user.id).order("created_at", { ascending: false });
  const demonstrated = (skills ?? []).filter((s) => s.source === "demonstrated");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Perfil y competencias" description="Tu perfil personaliza los retos. Actualízalo cuando aprendas algo nuevo." />
      {error && <Alert tone="danger">{error}</Alert>}
      {saved && <Alert tone="success">Perfil actualizado.</Alert>}
      <Card>
        <CardTitle>Competencias demostradas</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">Respaldadas por evidencias evaluadas en la plataforma. No son certificaciones oficiales.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {demonstrated.length === 0 ? <span className="text-sm text-muted-foreground">Aún ninguna.</span> : demonstrated.map((s) => <Badge key={s.skill_name} tone="success">{s.skill_name}</Badge>)}
        </div>
      </Card>
      <Card><ProfileForm action={saveProfileAction} mode="profile" defaults={profile} /></Card>
    </div>
  );
}
