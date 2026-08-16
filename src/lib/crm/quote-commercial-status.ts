import type { QuoteCommercialStatus } from "@/lib/crm/types";

export const QUOTE_COMMERCIAL_STATUS_LABELS: Record<
  QuoteCommercialStatus,
  string
> = {
  NONE: "Sin asignar",
  SENT: "Enviado",
  ACCEPTED: "Aceptado",
  REJECTED: "Rechazado",
};

/** Clases Tailwind para el semáforo comercial. */
export function quoteCommercialStatusClass(
  status: QuoteCommercialStatus | null | undefined,
): string {
  switch (status) {
    case "SENT":
      return "bg-amber-100 text-amber-800";
    case "ACCEPTED":
      return "bg-emerald-100 text-emerald-800";
    case "REJECTED":
      return "bg-red-100 text-red-800";
    default:
      return "bg-neutral-100 text-neutral-600";
  }
}

export function normalizeCommercialStatus(
  value: unknown,
): QuoteCommercialStatus {
  if (value === "SENT" || value === "ACCEPTED" || value === "REJECTED") {
    return value;
  }
  return "NONE";
}
