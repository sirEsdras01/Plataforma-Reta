import Link from "next/link";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/primitives";
import { configStatus } from "@/server/env";

export const metadata = { title: "Configuración pendiente" };
export const dynamic = "force-dynamic";

/** Estado de configuración visible sin sesión: nunca muestra valores, solo si están presentes. */
export default function SetupPage() {
  const items = configStatus();
  return (
    <main className="mx-auto max-w-2xl p-6 py-12">
      <PageHeader
        title="Configuración del entorno"
        description="La aplicación necesita credenciales externas. Ningún dato se simula: lo que no esté configurado aparece como pendiente."
      />
      <Card className="divide-y p-0">
        {items.map((i) => (
          <div key={i.key} className="flex items-start gap-3 p-4">
            {i.configured ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" aria-label="Configurado" />
            ) : (
              <CircleDashed className="mt-0.5 h-4 w-4 text-warning" aria-label="Pendiente" />
            )}
            <div>
              <p className="text-sm font-medium">
                {i.label} {i.required && <span className="text-xs text-muted-foreground">(requerido)</span>}
              </p>
              <p className="text-xs text-muted-foreground">{i.configured ? "Configurado" : `Configuración pendiente · ${i.howTo}`}</p>
            </div>
          </div>
        ))}
      </Card>
      <p className="mt-6 text-sm text-muted-foreground">
        Sigue <code>SETUP.md</code> en el repositorio. Cuando Supabase esté configurado podrás <Link className="underline" href="/login">iniciar sesión</Link>.
      </p>
    </main>
  );
}
