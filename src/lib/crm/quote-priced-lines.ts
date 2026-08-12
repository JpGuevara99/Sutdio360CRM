import type { QuoteLine } from "@/lib/crm/types";
import { groupQuoteLinesByCategory } from "@/lib/crm/quote-groups";
import {
  buildQuoteSummary,
  isLaborCategory,
  isLogisticsCategory,
  type QuotePercents,
} from "@/lib/crm/quote-summary";

export type QuoteDocumentVariant = "simple" | "detailed";

export function parseQuoteVariant(
  value: string | null | undefined,
): QuoteDocumentVariant {
  return value === "detailed" ? "detailed" : "simple";
}

export type PricedQuoteLine = QuoteLine & {
  costTotal: number;
  unitPrice: number;
  lineTotal: number;
};

export type PricedCategoryGroup = {
  categoryName: string;
  lines: PricedQuoteLine[];
  /** Subtotal de venta (con merma/utilidad/extra), antes de descuento */
  subtotal: number;
};

function clampPercent(value: number, max = 999) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(max, value);
}

function roundClp(value: number) {
  return Math.round(value);
}

function isMaterialLine(line: QuoteLine) {
  return (
    !isLaborCategory(line.categoryName) &&
    !isLogisticsCategory(line.categoryName)
  );
}

/** Total de venta de una línea antes de redondeo de ajuste (sin descuento). */
function rawLineTotal(line: QuoteLine, percents: QuotePercents): number {
  const m = clampPercent(percents.mermaPercent) / 100;
  const u = clampPercent(percents.utilidadPercent) / 100;
  const e = clampPercent(percents.extraPercent) / 100;
  const cost = line.quantity * line.unitCost;
  const merma = isMaterialLine(line) ? cost * m : 0;
  const utilidad = cost * u;
  const extra = (cost + merma + utilidad) * e;
  return cost + merma + utilidad + extra;
}

/**
 * Líneas con P/U y total de venta (merma/utilidad/extra).
 * El descuento NO se incluye: queda al pie del documento.
 * Ajusta la última línea para que Σ lineTotal === subtotalNeto.
 */
export function buildPricedQuoteLines(
  lines: QuoteLine[],
  percents: QuotePercents,
): PricedQuoteLine[] {
  const summary = buildQuoteSummary(lines, percents);
  const ordered = groupQuoteLinesByCategory(lines).flatMap((g) => g.lines);
  if (ordered.length === 0) return [];

  const raw = ordered.map((line) => ({
    line,
    costTotal: roundClp(line.quantity * line.unitCost),
    rawTotal: rawLineTotal(line, percents),
  }));

  const rounded = raw.map((row) => ({
    ...row,
    lineTotal: roundClp(row.rawTotal),
  }));

  const sumRounded = rounded.reduce((s, r) => s + r.lineTotal, 0);
  const drift = summary.subtotalNeto - sumRounded;
  if (rounded.length > 0 && drift !== 0) {
    const last = rounded[rounded.length - 1]!;
    last.lineTotal = Math.max(0, last.lineTotal + drift);
  }

  return rounded.map(({ line, costTotal, lineTotal }) => ({
    ...line,
    costTotal,
    lineTotal,
    unitPrice: line.quantity > 0 ? lineTotal / line.quantity : 0,
  }));
}

export function groupPricedLinesByCategory(
  priced: PricedQuoteLine[],
): PricedCategoryGroup[] {
  const map = new Map<string, PricedCategoryGroup>();
  for (const line of priced) {
    const key = line.categoryName || "Sin categoría";
    let group = map.get(key);
    if (!group) {
      group = { categoryName: key, lines: [], subtotal: 0 };
      map.set(key, group);
    }
    group.lines.push(line);
    group.subtotal += line.lineTotal;
  }
  return [...map.values()];
}
