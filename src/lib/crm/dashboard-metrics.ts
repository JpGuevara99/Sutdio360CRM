import {
  buildQuoteTotals,
  percentsFromQuote,
  quoteCostsFromLines,
} from "@/lib/crm/quote-summary";
import { clientFullName, formatClp } from "@/lib/crm/labels";
import { formatEntityCode } from "@/lib/crm/project-codes";
import type {
  Client,
  Project,
  Quote,
  QuoteCosts,
  QuoteWithLines,
} from "@/lib/crm/types";

export type DashboardSegment = "SENT" | "ACCEPTED" | "REJECTED";

export type DashboardQuoteItem = {
  quoteId: string;
  projectId: string;
  projectCode: string;
  clientName: string;
  quoteCode: string | null;
  title: string;
  segment: DashboardSegment;
  amount: number;
  totalNeto: number;
  includeIva: boolean;
  updatedAt: string;
};

export type DashboardSegmentStats = {
  segment: DashboardSegment;
  count: number;
  amount: number;
  items: DashboardQuoteItem[];
};

export type DashboardPeriodBucket = {
  key: string;
  label: string;
  count: number;
  amount: number;
};

export type DashboardMetrics = {
  visitsToday: number;
  reservados: number;
  segments: Record<DashboardSegment, DashboardSegmentStats>;
  /** Buckets temporales (semana ISO o día) sobre ítems del filtro activo */
  periodBuckets: DashboardPeriodBucket[];
  range: { from: string | null; to: string | null };
  filters: {
    segment: DashboardSegment | "ALL";
    amountMin: number | null;
    amountMax: number | null;
  };
};

function ms(value: Date | string): number {
  return (value instanceof Date ? value : new Date(value)).getTime();
}

function inRange(
  date: Date | string,
  from: Date | null,
  to: Date | null,
): boolean {
  const t = ms(date);
  if (from && t < from.getTime()) return false;
  if (to && t > to.getTime()) return false;
  return true;
}

const ZERO_COSTS: QuoteCosts = { labor: 0, logistics: 0, materials: 0 };

function quoteAmount(quote: Quote, costs: QuoteCosts): {
  amount: number;
  totalNeto: number;
  includeIva: boolean;
} {
  const totals = buildQuoteTotals(costs, percentsFromQuote(quote));
  return {
    amount: totals.totalConIva,
    totalNeto: totals.totalNeto,
    includeIva: totals.includeIva,
  };
}

function toItem(
  quote: Quote,
  project: Project,
  client: Client,
  segment: DashboardSegment,
  costs: QuoteCosts,
): DashboardQuoteItem {
  const { amount, totalNeto, includeIva } = quoteAmount(quote, costs);
  return {
    quoteId: quote.id,
    projectId: project.id,
    projectCode: formatEntityCode(project.publicCode),
    clientName: clientFullName(client),
    quoteCode: quote.quoteCode,
    title: quote.title,
    segment,
    amount,
    totalNeto,
    includeIva,
    updatedAt: (quote.updatedAt instanceof Date
      ? quote.updatedAt
      : new Date(quote.updatedAt)
    ).toISOString(),
  };
}

function emptyStats(segment: DashboardSegment): DashboardSegmentStats {
  return { segment, count: 0, amount: 0, items: [] };
}

function applyAmountFilter(
  items: DashboardQuoteItem[],
  amountMin: number | null,
  amountMax: number | null,
): DashboardQuoteItem[] {
  return items.filter((item) => {
    if (amountMin != null && item.amount < amountMin) return false;
    if (amountMax != null && item.amount > amountMax) return false;
    return true;
  });
}

function finalizeStats(
  segment: DashboardSegment,
  items: DashboardQuoteItem[],
): DashboardSegmentStats {
  return {
    segment,
    count: items.length,
    amount: items.reduce((sum, i) => sum + i.amount, 0),
    items: [...items].sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt)),
  };
}

/** Agrupa por semana (lunes) dentro del rango. */
export function buildPeriodBuckets(
  items: DashboardQuoteItem[],
  from: Date | null,
  to: Date | null,
): DashboardPeriodBucket[] {
  const map = new Map<string, DashboardPeriodBucket>();

  for (const item of items) {
    const d = new Date(item.updatedAt);
    // Semana ISO-like: lunes
    const day = d.getUTCDay();
    const diff = (day + 6) % 7;
    const monday = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff),
    );
    const key = monday.toISOString().slice(0, 10);
    const label = monday.toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "short",
    });
    const bucket = map.get(key) ?? {
      key,
      label,
      count: 0,
      amount: 0,
    };
    bucket.count += 1;
    bucket.amount += item.amount;
    map.set(key, bucket);
  }

  let buckets = [...map.values()].sort((a, b) => a.key.localeCompare(b.key));

  // Si hay pocas semanas y rango amplio, ok; si vacío, devolver []
  if (from && to && buckets.length === 0) return [];

  // Limitar a últimas 12 semanas visibles
  if (buckets.length > 12) buckets = buckets.slice(-12);
  return buckets;
}

export function computeDashboardQuoteSegments(input: {
  quotes: Quote[];
  costsByQuoteId: Map<string, QuoteCosts>;
  projectsById: Map<string, Project & { client: Client }>;
  from: Date | null;
  to: Date | null;
}): Record<DashboardSegment, DashboardQuoteItem[]> {
  const byProject = new Map<string, Quote[]>();
  for (const quote of input.quotes) {
    const list = byProject.get(quote.projectId) ?? [];
    list.push(quote);
    byProject.set(quote.projectId, list);
  }

  const accepted: DashboardQuoteItem[] = [];
  const rejected: DashboardQuoteItem[] = [];
  const sent: DashboardQuoteItem[] = [];

  for (const [projectId, projectQuotes] of byProject) {
    const project = input.projectsById.get(projectId);
    if (!project) continue;

    const sorted = [...projectQuotes].sort(
      (a, b) => ms(b.updatedAt) - ms(a.updatedAt),
    );

    // Aceptados: todas las ACCEPTED en rango
    for (const quote of sorted) {
      if ((quote.commercialStatus ?? "NONE") !== "ACCEPTED") continue;
      if (!inRange(quote.updatedAt, input.from, input.to)) continue;
      accepted.push(
        toItem(
          quote,
          project,
          project.client,
          "ACCEPTED",
          input.costsByQuoteId.get(quote.id) ?? ZERO_COSTS,
        ),
      );
    }

    // Rechazados: última cotización del proyecto si es REJECTED
    const latest = sorted[0];
    if (
      latest &&
      (latest.commercialStatus ?? "NONE") === "REJECTED" &&
      inRange(latest.updatedAt, input.from, input.to)
    ) {
      rejected.push(
        toItem(
          latest,
          project,
          project.client,
          "REJECTED",
          input.costsByQuoteId.get(latest.id) ?? ZERO_COSTS,
        ),
      );
    }

    // Enviados: última SENT del proyecto
    const latestSent = sorted.find(
      (q) => (q.commercialStatus ?? "NONE") === "SENT",
    );
    if (
      latestSent &&
      inRange(latestSent.updatedAt, input.from, input.to)
    ) {
      sent.push(
        toItem(
          latestSent,
          project,
          project.client,
          "SENT",
          input.costsByQuoteId.get(latestSent.id) ?? ZERO_COSTS,
        ),
      );
    }
  }

  return { ACCEPTED: accepted, REJECTED: rejected, SENT: sent };
}

export function buildDashboardMetrics(input: {
  visitsToday: number;
  reservados: number;
  quotes: Quote[];
  costsByQuoteId: Map<string, QuoteCosts>;
  projects: Array<Project & { client: Client }>;
  from: Date | null;
  to: Date | null;
  segment: DashboardSegment | "ALL";
  amountMin: number | null;
  amountMax: number | null;
}): DashboardMetrics {
  const projectsById = new Map(
    input.projects.map((p) => [p.id, p] as const),
  );

  const raw = computeDashboardQuoteSegments({
    quotes: input.quotes,
    costsByQuoteId: input.costsByQuoteId,
    projectsById,
    from: input.from,
    to: input.to,
  });

  const segments: Record<DashboardSegment, DashboardSegmentStats> = {
    SENT: finalizeStats(
      "SENT",
      applyAmountFilter(raw.SENT, input.amountMin, input.amountMax),
    ),
    ACCEPTED: finalizeStats(
      "ACCEPTED",
      applyAmountFilter(raw.ACCEPTED, input.amountMin, input.amountMax),
    ),
    REJECTED: finalizeStats(
      "REJECTED",
      applyAmountFilter(raw.REJECTED, input.amountMin, input.amountMax),
    ),
  };

  const chartItems =
    input.segment === "ALL"
      ? [
          ...segments.SENT.items,
          ...segments.ACCEPTED.items,
          ...segments.REJECTED.items,
        ]
      : segments[input.segment].items;

  return {
    visitsToday: input.visitsToday,
    reservados: input.reservados,
    segments,
    periodBuckets: buildPeriodBuckets(chartItems, input.from, input.to),
    range: {
      from: input.from?.toISOString() ?? null,
      to: input.to?.toISOString() ?? null,
    },
    filters: {
      segment: input.segment,
      amountMin: input.amountMin,
      amountMax: input.amountMax,
    },
  };
}

export const DASHBOARD_SEGMENT_LABELS: Record<DashboardSegment, string> = {
  SENT: "Enviados",
  ACCEPTED: "Aceptados",
  REJECTED: "Rechazados",
};

export function formatDashboardAmount(amount: number): string {
  return formatClp(amount);
}

/** Helper tipado para tests / callers que ya tienen QuoteWithLines */
export function amountFromQuoteWithLines(quote: QuoteWithLines): number {
  return quoteAmount(quote, quote.costs ?? quoteCostsFromLines(quote.lines))
    .amount;
}
