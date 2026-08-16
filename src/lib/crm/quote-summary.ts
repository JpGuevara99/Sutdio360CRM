import type { QuoteCosts, QuoteLine } from "@/lib/crm/types";
import { QUOTE_IVA_RATE } from "@/lib/crm/types";
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
  /** Si se incluye IVA en el documento */
  includeIva: boolean;
  /** IVA 19% sobre total neto (0 si no se incluye) */
  ivaAmount: number;
  /** Total neto + IVA (igual a totalNeto si no hay IVA) */
  totalConIva: number;
  /** Alias del total final al cliente (con IVA si aplica) */
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
  includeIva?: boolean;
}): QuotePercents & { includeIva: boolean } {
  return {
    mermaPercent: quote.mermaPercent ?? 0,
    utilidadPercent: quote.utilidadPercent ?? 0,
    extraPercent: quote.extraPercent ?? 0,
    discountPercent: quote.discountPercent ?? 0,
    includeIva: Boolean(quote.includeIva),
  };
}

export function formatPercent(value: number) {
  return `${value.toLocaleString("es-CL", {
    maximumFractionDigits: 2,
  })}%`;
}

/** Costos por tipo (mano de obra, logística, materiales) de un set de líneas. */
export function quoteCostsFromLines(lines: QuoteLine[]): QuoteCosts {
  const groups = groupQuoteLinesByCategory(lines);
  let labor = 0;
  let logistics = 0;
  let materials = 0;

  for (const group of groups) {
    if (isLaborCategory(group.categoryName)) labor += group.subtotal;
    else if (isLogisticsCategory(group.categoryName))
      logistics += group.subtotal;
    else materials += group.subtotal;
  }

  return { labor, logistics, materials };
}

export type QuoteTotals = {
  subtotalNeto: number;
  totalNeto: number;
  includeIva: boolean;
  ivaAmount: number;
  totalConIva: number;
};

/**
 * Totales a partir de los costos guardados en la cotización, sin leer líneas.
 */
export function buildQuoteTotals(
  costs: QuoteCosts,
  percents: QuotePercents & { includeIva?: boolean },
): QuoteTotals {
  const mermaPercent = clampPercent(percents.mermaPercent);
  const utilidadPercent = clampPercent(percents.utilidadPercent);
  const extraPercent = clampPercent(percents.extraPercent);

  const mermaAmount = roundClp(costs.materials * (mermaPercent / 100));
  const utilidadBase = costs.labor + costs.logistics + costs.materials;
  const utilidadAmount = roundClp(utilidadBase * (utilidadPercent / 100));
  const extraBase = utilidadBase + mermaAmount + utilidadAmount;
  const extraAmount = roundClp(extraBase * (extraPercent / 100));
  const subtotalNeto = extraBase + extraAmount;
  const discountPercent = clampPercent(percents.discountPercent, 100);
  const discountAmount = roundClp(subtotalNeto * (discountPercent / 100));
  const totalNeto = Math.max(0, subtotalNeto - discountAmount);
  const includeIva = Boolean(percents.includeIva);
  const ivaAmount = includeIva ? roundClp(totalNeto * QUOTE_IVA_RATE) : 0;

  return {
    subtotalNeto,
    totalNeto,
    includeIva,
    ivaAmount,
    totalConIva: totalNeto + ivaAmount,
  };
}

export function buildQuoteSummary(
  lines: QuoteLine[],
  percents: QuotePercents & { includeIva?: boolean },
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
  const includeIva = Boolean(percents.includeIva);
  const ivaAmount = includeIva ? roundClp(totalNeto * QUOTE_IVA_RATE) : 0;
  const totalConIva = totalNeto + ivaAmount;

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
    includeIva,
    ivaAmount,
    totalConIva,
    total: totalConIva,
  };
}
