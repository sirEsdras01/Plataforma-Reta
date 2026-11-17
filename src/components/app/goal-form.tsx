import { Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/submit-button";
import { createGoalAction } from "@/app/(app)/actions";

const EXAMPLES = [
  "Quiero aprender visión por computadora para que un robot detecte y clasifique objetos",
  "Quiero aprender machine learning y series temporales aplicadas a demanda eléctrica",
  "Quiero diseñar un sistema de monitoreo de contaminación del aire",
  "Quiero aprender procesamiento de señales biomédicas",
];

export function GoalForm({ compact = false }: { compact?: boolean }) {
  return (
    <form action={createGoalAction} className="space-y-3">
      <label htmlFor="goal" className="text-sm font-medium">¿Qué quieres aprender o construir?</label>
      <Textarea
        id="goal"
        name="goal"
        required
        minLength={8}
        maxLength={2000}
        rows={compact ? 3 : 4}
        placeholder={EXAMPLES[0]}
        className="text-base"
      />
      {!compact && (
        <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground" aria-label="Ejemplos">
          {EXAMPLES.slice(1).map((e) => (
            <li key={e} className="rounded-full border px-2 py-1">{e}</li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">La IA propondrá retos profesionales, no listas de cursos. Tarda alrededor de un minuto.</p>
        <SubmitButton pendingText="Diseñando retos…">
          <Sparkles className="h-4 w-4" /> Proponer reto
        </SubmitButton>
      </div>
    </form>
  );
}
