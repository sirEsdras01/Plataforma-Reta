/** Reglas puras de progreso de la ruta (sin I/O), compartidas por servidor y UI. */
import type { ModuleStatus } from "./schemas";

export interface ModuleLite {
  id: string;
  position: number;
  status: ModuleStatus;
  dependsOn: string[]; // ids
}

export function progressPct(modules: { status: ModuleStatus }[]): number {
  if (modules.length === 0) return 0;
  const weights: Record<ModuleStatus, number> = {
    pending: 0,
    preparing: 0.15,
    in_progress: 0.35,
    in_review: 0.6,
    needs_changes: 0.5,
    completed: 1,
  };
  const sum = modules.reduce((s, m) => s + weights[m.status], 0);
  return Math.round((sum / modules.length) * 10000) / 100;
}

/** Un módulo está desbloqueado si todas sus dependencias están completadas. */
export function isUnlocked(m: ModuleLite, all: ModuleLite[]): boolean {
  const byId = new Map(all.map((x) => [x.id, x]));
  return m.dependsOn.every((d) => byId.get(d)?.status === "completed");
}

/** Siguiente módulo recomendado: el primero desbloqueado que no esté completado. */
export function nextModule(all: ModuleLite[]): ModuleLite | null {
  const sorted = [...all].sort((a, b) => a.position - b.position);
  return sorted.find((m) => m.status !== "completed" && isUnlocked(m, all)) ?? null;
}

export const MODULE_STATUS_LABEL: Record<ModuleStatus, string> = {
  pending: "Pendiente",
  preparing: "En preparación",
  in_progress: "En desarrollo",
  in_review: "En revisión",
  completed: "Completado",
  needs_changes: "Requiere correcciones",
};

export function slugify(s: string, suffix?: string): string {
  const base = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  const full = suffix ? `${base || "proyecto"}-${suffix}` : base || "proyecto";
  return full.slice(0, 80);
}
