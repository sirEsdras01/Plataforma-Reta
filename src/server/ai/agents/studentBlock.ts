import type { StudentContext } from "@/domain/schemas";
import { untrusted } from "../untrusted";

/** Perfil del estudiante para la IA (escrito por el estudiante: datos no confiables, sin identificadores). */
export function studentBlock(s: StudentContext): string {
  // El perfil lo escribe el estudiante: se trata como datos no confiables.
  return untrusted(
    "student_profile",
    JSON.stringify(
      {
        programa: s.programName,
        institucion: s.institutionName,
        periodo: s.academicPeriod,
        intereses: s.interests,
        conocimientos_previos: s.priorKnowledge,
        herramientas: s.toolsKnown,
        experiencia_proyectos: s.projectExperience,
        objetivos_profesionales: s.careerGoals,
        horas_semanales: s.weeklyHours,
        idioma: s.preferredLanguage,
        hardware_laboratorio_presupuesto: s.hardwareAccess,
        competencias_demostradas_en_plataforma: s.demonstratedSkills,
      },
      null,
      2,
    ),
    4000,
  );
}

