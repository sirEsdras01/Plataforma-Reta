import { CheckCircle2, CircleDashed } from "lucide-react";
import { Alert, Card, CardTitle, Input, PageHeader, Select } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/submit-button";
import { ThemeToggle } from "@/components/theme";
import { configStatus } from "@/server/env";
import { daysAgoIso, requireOnboardedUser } from "@/server/services/session";
import { deleteAccountAction, setHelpLevelAction } from "../actions";

export const metadata = { title: "Configuración" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, user, profile } = await requireOnboardedUser();
  const since = daysAgoIso(30);
  const { data: usage } = await supabase.from("ai_usage_logs").select("input_tokens, output_tokens, estimated_cost_usd, status").eq("user_id", user.id).gte("created_at", since);
  const totals = (usage ?? []).reduce(
    (a, u) => ({ calls: a.calls + 1, tokens: a.tokens + (u.input_tokens ?? 0) + (u.output_tokens ?? 0), cost: a.cost + Number(u.estimated_cost_usd ?? 0), unknown: a.unknown + (u.estimated_cost_usd == null ? 1 : 0) }),
    { calls: 0, tokens: 0, cost: 0, unknown: 0 },
  );
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Configuración" />
      {error && <Alert tone="danger">{error}</Alert>}
      <Card className="flex items-center justify-between">
        <CardTitle>Tema claro / oscuro</CardTitle>
        <ThemeToggle />
      </Card>
      <Card>
        <CardTitle>Nivel de ayuda predeterminado del tutor</CardTitle>
        <form action={setHelpLevelAction} className="mt-3 flex gap-2">
          <Select name="level" defaultValue={profile.tutor_help_level}>
            <option value={1}>1 · Pregunta orientadora</option>
            <option value={2}>2 · Pista conceptual</option>
            <option value={3}>3 · Ejemplo relacionado</option>
            <option value={4}>4 · Explicación técnica detallada</option>
            <option value={5}>5 · Solución parcial guiada</option>
          </Select>
          <SubmitButton variant="outline">Guardar</SubmitButton>
        </form>
      </Card>
      <Card>
        <CardTitle>Uso de IA (últimos 30 días)</CardTitle>
        <p className="mt-2 text-sm">{totals.calls} solicitudes · {totals.tokens.toLocaleString("es-MX")} tokens · costo estimado ${totals.cost.toFixed(4)} USD{totals.unknown ? ` (+${totals.unknown} sin precio configurado)` : ""}</p>
      </Card>
      <Card>
        <CardTitle>Integraciones</CardTitle>
        <ul className="mt-3 space-y-2">
          {configStatus().map((i) => (
            <li key={i.key} className="flex items-start gap-2 text-sm">
              {i.configured ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" /> : <CircleDashed className="mt-0.5 h-4 w-4 text-warning" />}
              <span>{i.label}<span className="block text-xs text-muted-foreground">{i.configured ? "Operativa" : `Configuración pendiente · ${i.howTo}`}</span></span>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="border-danger/40">
        <CardTitle className="text-danger">Eliminar mi cuenta y mis datos</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">Borra permanentemente tu perfil, proyectos, evidencias, conversaciones y portafolio. No se puede deshacer.</p>
        <form action={deleteAccountAction} className="mt-3 flex gap-2">
          <Input name="confirm" placeholder="Escribe ELIMINAR" aria-label="Confirmación" />
          <SubmitButton variant="danger" pendingText="Eliminando…">Eliminar</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
