import { formatInTimeZone } from "date-fns-tz";
import { clientFullName } from "@/lib/crm/labels";
import { formatEntityCode } from "@/lib/crm/project-codes";
import type {
  Client,
  Project,
  ProjectExpense,
  ProjectExpenseCategory,
  PipelineStage,
  Quote,
} from "@/lib/crm/types";

const TZ = "America/Santiago";

export type ExpenseGranularity = "day" | "week" | "month";

export type ExpenseProjectRow = {
  kind: "closed";
  projectId: string;
  publicCode: string;
  clientName: string;
  title: string | null;
  closedAt: string;
  closedAmount: number;
  totalExpenses: number;
  netAmount: number;
  expenseCount: number;
};

export type ExecutionExpenseProjectRow = {
  kind: "execution";
  projectId: string;
  publicCode: string;
  clientName: string;
  title: string | null;
  approvedBudget: number;
  totalExpenses: number;
  remainingBudget: number;
  expenseCount: number;
};

export type ExpensePeriodBucket = {
  key: string;
  label: string;
  amount: number;
  count: number;
};

export type ExpenseDashboard = {
  projectCount: number;
  originalAmount: number;
  expenseAmount: number;
  result: number;
  rows: ExpenseProjectRow[];
  executionProjectCount: number;
  executionExpenseAmount: number;
  executionRows: ExecutionExpenseProjectRow[];
  buckets: ExpensePeriodBucket[];
  expensesByProject: Record<string, SerializedExpense[]>;
};

export type SerializedExpense = {
  id: string;
  projectId: string;
  amount: number;
  description: string;
  category: ProjectExpenseCategory;
  expenseDate: string;
  createdAt: string;
  updatedAt: string;
};

export function isConcretedProject(project: Project): boolean {
  return (
    project.closingOutcome === "APROBADO" &&
    project.closedAt != null &&
    !project.deletedAt
  );
}

function normalizeStageName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function isExecutionStageName(name: string): boolean {
  return normalizeStageName(name) === "en ejecucion";
}

export function canTrackExecutionProjectExpenses(input: {
  project: Project;
  stages: PipelineStage[];
  quotes: Quote[];
}): boolean {
  const executionStage = input.stages.find((stage) =>
    isExecutionStageName(stage.name),
  );
  return Boolean(
    executionStage &&
      input.project.stageId === executionStage.id &&
      input.project.closedAt == null &&
      input.project.closingOutcome == null &&
      !input.project.deletedAt &&
      input.quotes.some(
        (quote) =>
          quote.projectId === input.project.id &&
          quote.commercialStatus === "ACCEPTED",
      ),
  );
}

function inRange(date: Date, from: Date | null, to: Date | null): boolean {
  const t = date.getTime();
  if (from && t < from.getTime()) return false;
  if (to && t > to.getTime()) return false;
  return true;
}

function bucketKey(
  date: Date,
  granularity: ExpenseGranularity,
): { key: string; label: string } {
  if (granularity === "day") {
    const key = formatInTimeZone(date, TZ, "yyyy-MM-dd");
    return { key, label: formatInTimeZone(date, TZ, "dd/MM") };
  }
  if (granularity === "month") {
    const key = formatInTimeZone(date, TZ, "yyyy-MM");
    return { key, label: formatInTimeZone(date, TZ, "MMM yyyy") };
  }
  const week = formatInTimeZone(date, TZ, "II");
  const year = formatInTimeZone(date, TZ, "R");
  return { key: `${year}-W${week}`, label: `Sem ${week}` };
}

export function serializeExpense(expense: ProjectExpense): SerializedExpense {
  return {
    id: expense.id,
    projectId: expense.projectId,
    amount: expense.amount,
    description: expense.description,
    category: expense.category,
    expenseDate: expense.expenseDate.toISOString(),
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
  };
}

export function buildExpenseDashboard(input: {
  projects: Array<Project & { client: Client }>;
  expenses: ProjectExpense[];
  executionProjects?: Array<Project & { client: Client }>;
  approvedBudgetByProject?: Map<string, number>;
  from: Date | null;
  to: Date | null;
  query?: string;
  granularity?: ExpenseGranularity;
}): ExpenseDashboard {
  const granularity = input.granularity ?? "month";
  const q = input.query?.trim().toLowerCase() ?? "";

  const concreted = input.projects.filter(isConcretedProject);
  const expensesInRange = input.expenses.filter((expense) =>
    inRange(expense.expenseDate, input.from, input.to),
  );

  const expensesByProject = new Map<string, ProjectExpense[]>();
  for (const expense of expensesInRange) {
    const list = expensesByProject.get(expense.projectId) ?? [];
    list.push(expense);
    expensesByProject.set(expense.projectId, list);
  }

  const rows: ExpenseProjectRow[] = concreted
    .filter((project) => inRange(project.closedAt!, input.from, input.to))
    .map((project) => {
      const list = expensesByProject.get(project.id) ?? [];
      const totalExpenses = list.reduce((sum, item) => sum + item.amount, 0);
      const closedAmount = project.closedAmount ?? 0;
      return {
        kind: "closed" as const,
        projectId: project.id,
        publicCode: project.publicCode,
        clientName: clientFullName(project.client),
        title: project.title,
        closedAt: project.closedAt!.toISOString(),
        closedAmount,
        totalExpenses,
        netAmount: closedAmount - totalExpenses,
        expenseCount: list.length,
      };
    })
    .filter((row) => {
      if (!q) return true;
      const hay = `${formatEntityCode(row.publicCode)} ${row.publicCode} ${row.clientName} ${row.title ?? ""}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => b.closedAt.localeCompare(a.closedAt));

  const executionRows: ExecutionExpenseProjectRow[] = (
    input.executionProjects ?? []
  )
    .map((project) => {
      const list = expensesByProject.get(project.id) ?? [];
      const totalExpenses = list.reduce((sum, item) => sum + item.amount, 0);
      const approvedBudget =
        input.approvedBudgetByProject?.get(project.id) ?? 0;
      return {
        kind: "execution" as const,
        projectId: project.id,
        publicCode: project.publicCode,
        clientName: clientFullName(project.client),
        title: project.title,
        approvedBudget,
        totalExpenses,
        remainingBudget: approvedBudget - totalExpenses,
        expenseCount: list.length,
      };
    })
    .filter((row) => {
      if (!q) return true;
      const hay =
        `${formatEntityCode(row.publicCode)} ${row.publicCode} ${row.clientName} ${row.title ?? ""}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => a.publicCode.localeCompare(b.publicCode));

  const visibleIds = new Set([
    ...rows.map((row) => row.projectId),
    ...executionRows.map((row) => row.projectId),
  ]);
  const visibleExpenses = expensesInRange.filter((expense) =>
    visibleIds.has(expense.projectId),
  );

  const originalAmount = rows.reduce((sum, row) => sum + row.closedAmount, 0);
  const expenseAmount = rows.reduce((sum, row) => sum + row.totalExpenses, 0);
  const executionExpenseAmount = executionRows.reduce(
    (sum, row) => sum + row.totalExpenses,
    0,
  );

  const bucketMap = new Map<string, ExpensePeriodBucket>();
  for (const expense of visibleExpenses) {
    const { key, label } = bucketKey(expense.expenseDate, granularity);
    const current = bucketMap.get(key) ?? { key, label, amount: 0, count: 0 };
    current.amount += expense.amount;
    current.count += 1;
    bucketMap.set(key, current);
  }
  const buckets = [...bucketMap.values()].sort((a, b) =>
    a.key.localeCompare(b.key),
  );

  const expensesByProjectJson: Record<string, SerializedExpense[]> = {};
  for (const row of [...rows, ...executionRows]) {
    expensesByProjectJson[row.projectId] = (
      expensesByProject.get(row.projectId) ?? []
    ).map(serializeExpense);
  }

  return {
    projectCount: rows.length,
    originalAmount,
    expenseAmount,
    result: originalAmount - expenseAmount,
    rows,
    executionProjectCount: executionRows.length,
    executionExpenseAmount,
    executionRows,
    buckets,
    expensesByProject: expensesByProjectJson,
  };
}
