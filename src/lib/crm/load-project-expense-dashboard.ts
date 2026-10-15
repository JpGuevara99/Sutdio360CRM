import {
  buildExpenseDashboard,
  canTrackExecutionProjectExpenses,
  isExecutionStageName,
  type ExpenseGranularity,
} from "@/lib/crm/project-expense-metrics";
import { resolveQuoteCosts } from "@/lib/crm/quote-costs";
import { buildQuoteTotals, percentsFromQuote } from "@/lib/crm/quote-summary";
import { db } from "@/lib/db";
import type { QuoteCosts } from "@/lib/crm/types";

const ZERO_COSTS: QuoteCosts = { labor: 0, logistics: 0, materials: 0 };

export async function loadProjectExpenseDashboard(input: {
  from: Date | null;
  to: Date | null;
  query?: string;
  granularity?: ExpenseGranularity;
}) {
  const [projects, expenses, stages] = await Promise.all([
    db.listProjects(),
    db.listAllProjectExpenses(),
    db.listPipelineStages(),
  ]);

  const executionStage = stages.find((stage) =>
    isExecutionStageName(stage.name),
  );
  const executionCandidates = executionStage
    ? projects.filter((project) => project.stageId === executionStage.id)
    : [];
  const candidateQuotes = await db.listQuotesByProjectIds(
    executionCandidates.map((project) => project.id),
  );
  const executionProjects = executionCandidates.filter((project) =>
    canTrackExecutionProjectExpenses({
      project,
      stages,
      quotes: candidateQuotes,
    }),
  );

  const acceptedQuotesByProject = new Map<
    string,
    (typeof candidateQuotes)[number]
  >();
  for (const quote of candidateQuotes) {
    if (quote.commercialStatus !== "ACCEPTED") continue;
    const existing = acceptedQuotesByProject.get(quote.projectId);
    if (!existing || quote.updatedAt > existing.updatedAt) {
      acceptedQuotesByProject.set(quote.projectId, quote);
    }
  }

  const approvedQuotes = executionProjects.flatMap((project) => {
    const quote = acceptedQuotesByProject.get(project.id);
    return quote ? [quote] : [];
  });
  const costsByQuote = await resolveQuoteCosts(approvedQuotes);
  const approvedBudgetByProject = new Map(
    approvedQuotes.map((quote) => [
      quote.projectId,
      buildQuoteTotals(
        costsByQuote.get(quote.id) ?? ZERO_COSTS,
        percentsFromQuote(quote),
      ).totalConIva,
    ]),
  );

  return buildExpenseDashboard({
    projects,
    expenses,
    executionProjects,
    approvedBudgetByProject,
    ...input,
  });
}
