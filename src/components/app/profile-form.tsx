"use client";
import { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/submit-button";

export interface ProfileDefaults {
  full_name?: string | null;
  institution_name?: string | null;
  program_name?: string | null;
  academic_period?: string | null;
  interests?: string[];
  prior_knowledge?: string | null;
  tools_known?: string[];
  project_experience?: string | null;
  career_goals?: string | null;
  weekly_hours?: number | null;
  preferred_language?: string | null;
  hardware_access?: string | null;
}

const STEPS = ["Tú", "Tu formación", "Tus metas"];

/**
 * Onboarding progresivo en 3 pasos (todos los campos viven en un solo <form>,
 * los pasos solo controlan la visibilidad). En modo "profile" muestra todo junto.
 */
export function ProfileForm({
  action,
  defaults,
  mode,
}: {
  action: (fd: FormData) => Promise<void>;
  defaults: ProfileDefaults;
  mode: "onboarding" | "profile";
}) {
  const [step, setStep] = useState(0);
  const show = (i: number) => mode === "profile" || step === i;
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="returnTo" value={mode === "profile" ? "/profile" : "/dashboard"} />
      {mode === "onboarding" && (
        <ol className="flex gap-2 text-xs" aria-label="Pasos">
          {STEPS.map((s, i) => (
            <li key={s} className={`flex-1 border-t-2 pt-2 ${i <= step ? "border-primary text-foreground" : "border-border text-muted-foreground"}`}>
              {i + 1}. {s}
            </li>
          ))}
        </ol>
      )}

      <fieldset className={show(0) ? "grid gap-4 sm:grid-cols-2" : "hidden"}>
        <div>
          <Label htmlFor="full_name">Nombre</Label>
          <Input id="full_name" name="full_name" required minLength={2} defaultValue={defaults.full_name ?? ""} />
        </div>
        <div>
          <Label htmlFor="preferred_language">Idioma preferido</Label>
          <Select id="preferred_language" name="preferred_language" defaultValue={defaults.preferred_language ?? "es"}>
            <option value="es">Español</option>
            <option value="en">English</option>
            <option value="pt">Português</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="institution_name">Universidad</Label>
          <Input id="institution_name" name="institution_name" required defaultValue={defaults.institution_name ?? "Tecnológico de Monterrey"} />
        </div>
        <div>
          <Label htmlFor="program_name">Programa académico o ingeniería</Label>
          <Input id="program_name" name="program_name" required placeholder="p.ej. Ingeniería Mecatrónica" defaultValue={defaults.program_name ?? ""} />
        </div>
        <div>
          <Label htmlFor="academic_period">Semestre o año</Label>
          <Input id="academic_period" name="academic_period" placeholder="p.ej. 5º semestre" defaultValue={defaults.academic_period ?? ""} />
        </div>
        <div>
          <Label htmlFor="weekly_hours">Horas por semana para proyectos</Label>
          <Input id="weekly_hours" name="weekly_hours" type="number" min={0} max={80} required defaultValue={defaults.weekly_hours ?? 6} />
        </div>
      </fieldset>

      <fieldset className={show(1) ? "grid gap-4" : "hidden"}>
        <div>
          <Label htmlFor="prior_knowledge">¿Qué sabes ya? (conocimientos técnicos previos)</Label>
          <Textarea id="prior_knowledge" name="prior_knowledge" placeholder="p.ej. Python básico, estadística descriptiva, cálculo vectorial…" defaultValue={defaults.prior_knowledge ?? ""} />
          <p className="mt-1 text-xs text-muted-foreground">Tu semestre no determina tu nivel: cuéntanos lo que realmente dominas.</p>
        </div>
        <div>
          <Label htmlFor="tools_known">Herramientas, software y lenguajes (separados por comas)</Label>
          <Input id="tools_known" name="tools_known" placeholder="Python, MATLAB, Arduino, SolidWorks" defaultValue={(defaults.tools_known ?? []).join(", ")} />
        </div>
        <div>
          <Label htmlFor="project_experience">Experiencia en proyectos</Label>
          <Select id="project_experience" name="project_experience" defaultValue={defaults.project_experience ?? "academic"}>
            <option value="none">Aún ninguna</option>
            <option value="academic">Proyectos de clase</option>
            <option value="personal">Proyectos personales</option>
            <option value="professional">Prácticas o trabajo profesional</option>
            <option value="research">Investigación</option>
          </Select>
        </div>
      </fieldset>

      <fieldset className={show(2) ? "grid gap-4" : "hidden"}>
        <div>
          <Label htmlFor="interests">Áreas de interés (separadas por comas)</Label>
          <Input id="interests" name="interests" placeholder="robótica, energía, visión por computadora" defaultValue={(defaults.interests ?? []).join(", ")} />
        </div>
        <div>
          <Label htmlFor="career_goals">Objetivos profesionales</Label>
          <Textarea id="career_goals" name="career_goals" placeholder="¿Dónde te ves trabajando o investigando?" defaultValue={defaults.career_goals ?? ""} />
        </div>
        <div>
          <Label htmlFor="hardware_access">Hardware, laboratorio y presupuesto disponibles (opcional)</Label>
          <Textarea id="hardware_access" name="hardware_access" placeholder="p.ej. Raspberry Pi, acceso a laboratorio de manufactura, ~1,000 MXN" defaultValue={defaults.hardware_access ?? ""} />
        </div>
      </fieldset>

      <div className="flex justify-between">
        {mode === "onboarding" && step > 0 ? (
          <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft className="h-4 w-4" /> Atrás
          </Button>
        ) : (
          <span />
        )}
        {mode === "onboarding" && step < STEPS.length - 1 ? (
          <Button type="button" onClick={() => setStep((s) => s + 1)}>
            Continuar <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <SubmitButton pendingText="Guardando…">{mode === "onboarding" ? "Empezar" : "Guardar perfil"}</SubmitButton>
        )}
      </div>
    </form>
  );
}
