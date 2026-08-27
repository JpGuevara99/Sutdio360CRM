import type { PipelineStage, ProjectStatus } from "@/lib/crm/types";

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

function normalizeStageName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** Palabras clave de etapa del pipeline para inferir estado comercial al mover tarjetas. */
const STAGE_STATUS_HINTS: Array<{ hints: string[]; status: ProjectStatus }> = [
  {
    hints: [
      "visita agendada",
      "visita tecnica",
      "visita técnica",
      "reservado",
    ],
    status: "RESERVADO",
  },
  {
    hints: ["revision tecnica", "revisión técnica"],
    status: "VISITADO",
  },
  { hints: ["por cotizar"], status: "VISITADO" },
  { hints: ["cotizado"], status: "COTIZADO" },
  { hints: ["seguimiento"], status: "SEGUIMIENTO" },
  { hints: ["aprobado"], status: "APROBADO" },
  { hints: ["produccion", "producción"], status: "PRODUCCION" },
  { hints: ["instalacion", "instalación"], status: "INSTALACION" },
  { hints: ["garantia", "garantía"], status: "GARANTIA" },
];

/** Estado comercial sugerido al mover el proyecto a una etapa del pipeline. */
export function statusForStage(
  stage: Pick<PipelineStage, "name">,
): ProjectStatus | null {
  if (isClosedStageName(stage.name)) return null;

  const normalizedStage = normalizeStageName(stage.name);
  for (const entry of STAGE_STATUS_HINTS) {
    for (const hint of entry.hints) {
      if (normalizedStage.includes(normalizeStageName(hint))) {
        return entry.status;
      }
    }
  }
  return null;
}

/** Palabras clave de etapa del pipeline para cada estado comercial. */
const STATUS_STAGE_HINTS: Record<ProjectStatus, string[]> = {
  RESERVADO: ["visita agendada", "visita tecnica", "visita técnica", "reservado"],
  VISITADO: ["revision tecnica", "revisión técnica", "por cotizar"],
  COTIZADO: ["cotizado"],
  SEGUIMIENTO: ["seguimiento"],
  APROBADO: ["aprobado"],
  RECHAZADO: ["cerrado", "rechazado"],
  PRODUCCION: ["produccion", "producción", "aprobado"],
  INSTALACION: ["instalacion", "instalación", "aprobado"],
  GARANTIA: ["garantia", "garantía", "aprobado"],
  CERRADO: ["cerrado"],
};

/** Resuelve la columna del pipeline que corresponde a un estado comercial. */
export function stageIdForStatus(
  status: ProjectStatus,
  stages: PipelineStage[],
): string | null {
  if (stages.length === 0) return null;
  const hints = STATUS_STAGE_HINTS[status];
  const sorted = sortStages(stages);

  for (const hint of hints) {
    const normalizedHint = normalizeStageName(hint);
    const match = sorted.find((stage) =>
      normalizeStageName(stage.name).includes(normalizedHint),
    );
    if (match) return match.id;
  }

  if (status === "CERRADO" || status === "RECHAZADO") {
    const closed = sorted.find((stage) => isClosedStageName(stage.name));
    if (closed) return closed.id;
  }

  return null;
}

export function closedStageIdFromList(
  stages: PipelineStage[],
): string | null {
  return stages.find((stage) => isClosedStageName(stage.name))?.id ?? null;
}
