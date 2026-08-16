import { db } from "@/lib/db";
import { cancelPendingFollowUpTask } from "@/lib/crm/follow-up-engine";
import { isClosedStageName } from "@/lib/crm/pipeline";
import type {
  ProjectClosingOutcome,
  ProjectWithRelations,
} from "@/lib/crm/types";

export type CloseProjectInput = {
  projectId: string;
  outcome: ProjectClosingOutcome;
  /** Cotización con la que se concretó (o se rechazó) el proyecto */
  quoteId?: string | null;
  /** Monto confirmado al cerrar */
  amount?: number | null;
  /** Fecha de finalización confirmada por el usuario */
  closedAt?: Date | null;
};

/**
 * Cierra el proyecto: fija conclusión, monto y fecha, lo manda a la etapa
 * "Cerrado" y detiene la secuencia de seguimientos.
 */
export async function closeProject(
  input: CloseProjectInput,
): Promise<ProjectWithRelations> {
  const project = await db.getProjectById(input.projectId);
  if (!project) throw new Error("Proyecto no encontrado");

  let quoteId: string | null = null;
  if (input.quoteId) {
    const quote = await db.getQuoteById(input.quoteId);
    if (!quote || quote.projectId !== project.id) {
      throw new Error("La cotización no pertenece a este proyecto");
    }
    quoteId = quote.id;
  }

  const stages = await db.listPipelineStages();
  const closedStage = stages.find((stage) => isClosedStageName(stage.name));

  await cancelPendingFollowUpTask(project);

  const closedAt = input.closedAt ?? new Date();
  const amount =
    input.amount == null || !Number.isFinite(input.amount)
      ? null
      : Math.max(0, Math.round(input.amount));

  await db.updateProject(project.id, {
    status: input.outcome,
    stageId: closedStage?.id ?? project.stageId,
    boardOrder: -closedAt.getTime(),
    closedAt,
    closingOutcome: input.outcome,
    closedQuoteId: quoteId,
    closedAmount: amount,
    followUpNextNumber: null,
    followUpNextAt: null,
    followUpTaskId: null,
    followUpTaskListId: null,
  });

  if (quoteId) {
    await db.updateQuote(quoteId, {
      commercialStatus: input.outcome === "APROBADO" ? "ACCEPTED" : "REJECTED",
    });
  }

  const refreshed = await db.getProjectById(project.id);
  if (!refreshed) throw new Error("Proyecto no encontrado tras cerrar");
  return refreshed;
}
