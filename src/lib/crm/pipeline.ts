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

export function sortStages(stages: PipelineStage[]): PipelineStage[] {
  return [...stages].sort((a, b) => a.order - b.order);
}
