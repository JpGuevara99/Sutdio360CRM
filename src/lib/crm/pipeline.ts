import type { PipelineStage } from "@/lib/crm/types";

export const DEFAULT_PIPELINE_STAGES = [
  "Visita agendada",
  "Revisión técnica",
  "Por cotizar",
  "Cotizado",
  "Seguimiento",
  "Aprobado",
  "Cerrado",
] as const;

/** Nombre de la etapa fija de cierre (no editable ni eliminable). */
export const CLOSED_STAGE_NAME = "Cerrado";

/** Días que una tarjeta cerrada permanece visible en el pipeline. */
export const CLOSED_STAGE_VISIBLE_DAYS = 45;

export function isClosedStageName(name: string): boolean {
  return name.trim().toLowerCase() === CLOSED_STAGE_NAME.toLowerCase();
}

/**
 * Deja fuera del tablero las tarjetas cerradas hace más de 45 días; siguen
 * disponibles en la ficha del proyecto.
 */
export function splitVisibleClosedProjects<
  T extends { stageId: string | null; closedAt: Date | null },
>(
  projects: T[],
  closedStageId: string | null,
): { visible: T[]; hiddenCount: number } {
  if (!closedStageId) return { visible: projects, hiddenCount: 0 };
  const cutoff =
    Date.now() - CLOSED_STAGE_VISIBLE_DAYS * 24 * 60 * 60 * 1000;
  const visible = projects.filter((project) => {
    if (project.stageId !== closedStageId) return true;
    if (!project.closedAt) return true;
    return project.closedAt.getTime() >= cutoff;
  });
  return { visible, hiddenCount: projects.length - visible.length };
}

export function sortStages(stages: PipelineStage[]): PipelineStage[] {
  const ordered = [...stages].sort((a, b) => a.order - b.order);
  // La etapa de cierre siempre va al final del tablero.
  const closed = ordered.filter((s) => isClosedStageName(s.name));
  if (closed.length === 0) return ordered;
  return [...ordered.filter((s) => !isClosedStageName(s.name)), ...closed];
}
