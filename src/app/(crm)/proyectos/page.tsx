import { TopBar } from "@/components/crm/TopBar";
import { PageBody } from "@/components/crm/PageBody";
import {
  ProjectsPipeline,
  type BoardProject,
} from "@/components/crm/ProjectsPipeline";
import { syncDueFollowUps } from "@/lib/crm/follow-up-engine";
import { clientFullName } from "@/lib/crm/labels";
import {
  isClosedStageName,
  splitVisibleClosedProjects,
} from "@/lib/crm/pipeline";
import {
  buildQuoteTotals,
  percentsFromQuote,
} from "@/lib/crm/quote-summary";
import { resolveQuoteCosts } from "@/lib/crm/quote-costs";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { db } from "@/lib/db";

export default async function ProjectsPage() {
  // Cada página valida la sesión: el layout y las páginas se renderizan en
  // paralelo, así que confiar solo en el layout dejaría correr estas consultas.
  await requirePageSession();

  // Al cumplirse un seguimiento se agenda el siguiente de la secuencia.
  try {
    await syncDueFollowUps();
  } catch (error) {
    console.error("ProjectsPage: syncDueFollowUps failed", error);
  }

  const [stages, projects, followUpSettings, quotes] = await Promise.all([
    db.listPipelineStages(),
    db.listProjects(),
    db.getFollowUpSettings(),
    db.listAllQuotes(),
  ]);

  // Monto visible en la tarjeta: total de la última cotización del proyecto
  const latestQuoteByProject = new Map<string, (typeof quotes)[number]>();
  for (const quote of quotes) {
    const current = latestQuoteByProject.get(quote.projectId);
    if (!current || quote.createdAt.getTime() > current.createdAt.getTime()) {
      latestQuoteByProject.set(quote.projectId, quote);
    }
  }

  // Costos guardados en cada cotización: sin leer líneas.
  const costsByQuote = await resolveQuoteCosts([
    ...latestQuoteByProject.values(),
  ]);

  const amountByProject = new Map<string, number>();
  for (const [projectId, quote] of latestQuoteByProject) {
    const totals = buildQuoteTotals(
      costsByQuote.get(quote.id) ?? { labor: 0, logistics: 0, materials: 0 },
      percentsFromQuote(quote),
    );
    amountByProject.set(projectId, totals.totalConIva);
  }

  const closedStageId =
    stages.find((stage) => isClosedStageName(stage.name))?.id ?? null;
  const closedSplit = splitVisibleClosedProjects(projects, closedStageId);

  const boardProjects: BoardProject[] = closedSplit.visible.map((project) => {
    const visit = project.visits[0];
    return {
      id: project.id,
      publicCode: project.publicCode,
      stageId: project.stageId,
      boardOrder: project.boardOrder,
      status: project.status,
      clientName: clientFullName(project.client),
      address: project.client.address,
      visitAt: visit ? visit.scheduledAt.toISOString() : null,
      bookedAt: visit ? visit.bookedAt.toISOString() : null,
      source: visit?.source ?? null,
      followUpCount: project.followUpCount ?? 0,
      followUpNextNumber: project.followUpNextNumber ?? null,
      closedAt: project.closedAt ? project.closedAt.toISOString() : null,
      lastQuoteAmount: amountByProject.get(project.id) ?? null,
    };
  });

  return (
    <>
      <TopBar title="Proyectos" />
      <PageBody fill>
        <ProjectsPipeline
          initialStages={stages.map((s) => ({
            id: s.id,
            name: s.name,
            order: s.order,
          }))}
          initialProjects={boardProjects}
          hiddenClosedCount={closedSplit.hiddenCount}
          initialFollowUpSettings={{
            count: followUpSettings.count,
            intervalDays: followUpSettings.intervalDays,
            updatedAt: followUpSettings.updatedAt,
          }}
        />
      </PageBody>
    </>
  );
}
