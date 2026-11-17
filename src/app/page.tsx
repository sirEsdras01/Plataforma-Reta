import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ArrowRight, BookOpenCheck, FlaskConical, GraduationCap, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export default async function Landing() {
  await connection();
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) redirect("/dashboard");
  }
  const features = [
    { icon: FlaskConical, title: "Retos profesionales", text: "Escribe lo que quieres aprender y recibe un proyecto real con entregables verificables." },
    { icon: BookOpenCheck, title: "Aprendizaje just-in-time", text: "Solo lo que necesitas para la tarea actual, con fuentes académicas recuperadas de proveedores reales." },
    { icon: GraduationCap, title: "Tutor que guía", text: "Pistas progresivas y preguntas orientadoras; no hace el proyecto por ti." },
    { icon: ShieldCheck, title: "Evidencia, no clics", text: "Evaluación con rúbricas transparentes y un portafolio que distingue lo recibido de lo verificado." },
  ];
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between p-6">
        <span className="flex items-center gap-2 font-semibold">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">R</span>
          {APP_NAME}
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className={buttonVariants({ variant: "outline", size: "sm" })}>Iniciar sesión</Link>
        </div>
      </header>
      <section className="mx-auto max-w-5xl px-6 pb-16 pt-12">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-primary">Para estudiantes de ingeniería</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">{APP_TAGLINE}.</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          No enseñamos con cursos convencionales. Construyes un proyecto profesional mientras la IA identifica qué necesitas aprender, cuándo y con qué recurso.
        </p>
        <Link href="/login" className={buttonVariants({ size: "lg", className: "mt-8" })}>
          Empezar mi primer reto <ArrowRight className="h-4 w-4" />
        </Link>
        <div className="mt-16 grid gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-5">
              <f.icon className="mb-3 h-5 w-5 text-primary" aria-hidden />
              <h2 className="text-sm font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
