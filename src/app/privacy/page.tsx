import { Card, PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Privacidad" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl p-6 py-12">
      <PageHeader title="Privacidad y uso de datos" description="Resumen operativo del MVP. Debe revisarse legalmente antes de producción." />
      <Card className="space-y-3 text-sm leading-relaxed">
        <p>Guardamos tu perfil académico, objetivos, proyectos, evidencias, conversaciones con el tutor y tu progreso para personalizar tus retos.</p>
        <p>Cada estudiante solo puede acceder a sus propios datos (Row Level Security en la base de datos). Tus evidencias se almacenan en un bucket privado.</p>
        <p>Para generar retos, explicaciones y evaluaciones enviamos al proveedor de IA configurado (Anthropic o Google) el contexto necesario: tu perfil académico sin correo ni identificadores, y el contenido de tu proyecto. No enviamos datos de otros estudiantes.</p>
        <p>Tu portafolio es privado por defecto; solo es público si tú lo activas.</p>
        <p>Las competencias y evaluaciones generadas con IA no son certificaciones ni acreditaciones universitarias oficiales.</p>
        <p>Puedes editar tu perfil en cualquier momento y eliminar tu cuenta con todos tus datos desde Configuración.</p>
      </Card>
    </main>
  );
}
