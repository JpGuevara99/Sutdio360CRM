import type { MaterialUnit, ProjectStatus, VisitSource } from "@/lib/crm/types";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  RESERVADO: "Reservado",
  VISITADO: "Visitado",
  COTIZADO: "Cotizado",
  SEGUIMIENTO: "Seguimiento",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
  PRODUCCION: "Producción",
  INSTALACION: "Instalación",
  GARANTIA: "Garantía",
  CERRADO: "Cerrado",
};

export const VISIT_SOURCE_LABELS: Record<VisitSource, string> = {
  APPOINTMENT_SCHEDULE: "Google Appointment",
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  PHONE: "Llamada",
  MANUAL: "Manual",
};

export const MATERIAL_UNIT_LABELS: Record<MaterialUnit, string> = {
  ML: "Metro Lineal (ml)",
  M2: "Metro Cuadrado (m²)",
  M3: "Metro Cúbico (m³)",
  UD: "Unidad (Ud)",
  D: "Días (d)",
};

export const MATERIAL_UNITS = Object.keys(
  MATERIAL_UNIT_LABELS,
) as MaterialUnit[];

export function clientFullName(client: {
  firstName: string;
  lastName: string;
}): string {
  return `${client.firstName} ${client.lastName}`.trim();
}

/** Redondea a 2 decimales para montos. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Redondea cantidades (m², ml, etc.) a 4 decimales. */
export function roundQty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

/**
 * Lee un número en formato chileno o anglosajón: `12,5`, `12.5`, `15.000,50`.
 * Devuelve `null` si el texto aún está a medias (p. ej. `12,`).
 */
export function parseDecimalNumber(
  raw: string,
  decimals: 2 | 4 = 2,
): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  let normalized = trimmed.replace(/\$/g, "").replace(/\s/g, "");
  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");
  if (hasComma && hasDot) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = normalized.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "");
  }
  if (/^\d+\.$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return decimals === 4 ? roundQty(value) : roundMoney(value);
}

/** Campo editable sin separador de miles: `15000,5`. */
export function formatDecimalInput(
  value: number,
  decimals: 2 | 4 = 2,
): string {
  if (!Number.isFinite(value)) return "";
  return value.toLocaleString("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
    useGrouping: false,
  });
}

export function formatClp(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundMoney(amount));
}

export function formatQty(amount: number): string {
  return roundQty(amount).toLocaleString("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}
