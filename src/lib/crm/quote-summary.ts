import type { QuoteLine } from "@/lib/crm/types";
import { groupQuoteLinesByCategory } from "@/lib/crm/quote-groups";

export const LABOR_CATEGORY = "Mano de Obra";
export const LOGISTICS_CATEGORY = "Logística";

export type QuotePercents = {
  mermaPercent: number;
  utilidadPercent: number;
  extraPercent: number;
  discountPercent: number;
};

export type QuoteSummary = {
  labor: number;
  logistics: number;
  materials: number;
  materialGroups: { categoryName: string; subtotal: number }[];
  mermaPercent: number;
  mermaAmount: number;
  utilidadPercent: number;
  utilidadAmount: number;
  extraPercent: number;
  extraAmount: number;
  discountPercent: number;
  discountAmount: number;
  /** Total de costos + merma + utilidad + extra, antes de descuento */
  subtotalNeto: number;
  /** Subtotal neto menos descuento */
  totalNeto: number;
  /** Alias de totalNeto (total final al cliente) */
  total: number;
};

function normalizeCategory(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function isLaborCategory(name: string) {
  return normalizeCategory(name) === normalizeCategory(LABOR_CATEGORY);
}

export function isLogisticsCategory(name: string) {
  return normalizeCategory(name) === normalizeCategory(LOGISTICS_CATEGORY);
}

function clampPercent(value: number, max = 999) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(max, value);
}

function roundClp(value: number) {
  return Math.round(value);
}

export function percentsFromQuote(quote: {
  mermaPercent?: number;
  utilidadPercent?: number;
  extraPercent?: number;
  discountPercent?: number;
}): QuotePercents {
  return {
    mermaPercent: quote.mermaPercent ?? 0,
    utilidadPercent: quote.utilidadPercent ?? 0,
    extraPercent: quote.extraPercent ?? 0,
    discountPercent: quote.discountPercent ?? 0,
  };
}

export function formatPercent(value: number) {
  return `${value.toLocaleString("es-CL", {
    maximumFractionDigits: 2,
  })}%`;
}

export function buildQuoteSummary(
  lines: QuoteLine[],
  percents: QuotePercents,
): QuoteSummary {
  const groups = groupQuoteLinesByCategory(lines);
  let labor = 0;
  let logistics = 0;
  const materialGroups: QuoteSummary["materialGroups"] = [];

  for (const group of groups) {
    if (isLaborCategory(group.categoryName)) {
      labor += group.subtotal;
      continue;
    }
    if (isLogisticsCategory(group.categoryName)) {
      logistics += group.subtotal;
      continue;
    }
    materialGroups.push({
      categoryName: group.categoryName,
      subtotal: group.subtotal,
    });
  }

  const materials = materialGroups.reduce((sum, g) => sum + g.subtotal, 0);
  const mermaPercent = clampPercent(percents.mermaPercent);
  const utilidadPercent = clampPercent(percents.utilidadPercent);
  const extraPercent = clampPercent(percents.extraPercent);

  const mermaAmount = roundClp(materials * (mermaPercent / 100));
  const utilidadBase = labor + logistics + materials;
  const utilidadAmount = roundClp(utilidadBase * (utilidadPercent / 100));
  const extraBase =
    labor + logistics + materials + mermaAmount + utilidadAmount;
  const extraAmount = roundClp(extraBase * (extraPercent / 100));
  const subtotalNeto = extraBase + extraAmount;
  const discountPercent = clampPercent(percents.discountPercent, 100);
  const discountAmount = roundClp(subtotalNeto * (discountPercent / 100));
  const totalNeto = Math.max(0, subtotalNeto - discountAmount);

  return {
    labor,
    logistics,
    materials,
    materialGroups,
    mermaPercent,
    mermaAmount,
    utilidadPercent,
    utilidadAmount,
    extraPercent,
    extraAmount,
    discountPercent,
    discountAmount,
    subtotalNeto,
    totalNeto,
    total: totalNeto,
  };
}
