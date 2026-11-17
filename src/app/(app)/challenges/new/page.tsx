import { Alert, Card, PageHeader } from "@/components/ui/primitives";
import { GoalForm } from "@/components/app/goal-form";
import { requireOnboardedUser } from "@/server/services/session";
import { isAIConfigured } from "@/server/ai/client";

export const metadata = { title: "Nuevo reto" };
export const maxDuration = 300;

export default async function NewChallengePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireOnboardedUser();
  const { error } = await searchParams;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nuevo reto" description="Describe tu objetivo con tus palabras. Mientras más contexto, mejor el reto." />
      {!isAIConfigured() && <div className="mb-4"><Alert tone="warning">La IA está en configuración pendiente: no se pueden generar retos todavía. Revisa Configuración.</Alert></div>}
      {error && <div className="mb-4"><Alert tone="danger">{error}</Alert></div>}
      <Card><GoalForm /></Card>
    </div>
  );
}
