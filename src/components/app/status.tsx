import { Badge } from "@/components/ui/primitives";
import { MODULE_STATUS_LABEL } from "@/domain/progress";
import type { ModuleStatus } from "@/domain/schemas";

const TONE: Record<ModuleStatus, "neutral" | "primary" | "success" | "warning" | "danger"> = {
  pending: "neutral",
  preparing: "primary",
  in_progress: "primary",
  in_review: "warning",
  completed: "success",
  needs_changes: "danger",
};

export function ModuleStatusBadge({ status }: { status: ModuleStatus }) {
  return <Badge tone={TONE[status]}>{MODULE_STATUS_LABEL[status]}</Badge>;
}

const CONCEPT_LABEL: Record<string, string> = {
  pending: "Por estudiar",
  studying: "Estudiando",
  practicing: "Practicando",
  mastered: "Dominado (práctica aprobada)",
  skipped_known: "Ya lo sé (declarado)",
};

export function ConceptStatusBadge({ status }: { status: string }) {
  const tone = status === "mastered" ? "success" : status === "skipped_known" ? "neutral" : status === "pending" ? "neutral" : "primary";
  return <Badge tone={tone}>{CONCEPT_LABEL[status] ?? status}</Badge>;
}
