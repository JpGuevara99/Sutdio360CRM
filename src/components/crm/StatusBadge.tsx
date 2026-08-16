import type { ProjectStatus } from "@/lib/crm/types";
import { PROJECT_STATUS_LABELS } from "@/lib/crm/labels";

const COLORS: Record<ProjectStatus, string> = {
  RESERVADO: "bg-primary-soft text-primary-text",
  VISITADO: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  COTIZADO: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  SEGUIMIENTO: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  APROBADO: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  RECHAZADO: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  PRODUCCION: "bg-primary-soft text-primary-text",
  INSTALACION: "bg-danger-soft text-danger",
  GARANTIA: "bg-hover text-muted-strong",
  CERRADO: "bg-hover text-muted",
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${COLORS[status]}`}
    >
      {PROJECT_STATUS_LABELS[status]}
    </span>
  );
}
