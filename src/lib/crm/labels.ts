import type { MaterialUnit, ProjectStatus, VisitSource } from "@/lib/crm/types";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  RESERVADO: "Reservado",
  VISITADO: "Visitado",
  COTIZADO: "Cotizado",
  SEGUIMIENTO: "Seguimiento",
  APROBADO: "Aprobado",
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

export function formatClp(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatQty(amount: number): string {
  return amount.toLocaleString("es-CL", {
    maximumFractionDigits: 2,
  });
}
