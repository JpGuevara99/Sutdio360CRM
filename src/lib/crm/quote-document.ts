import type { Quote } from "@/lib/crm/types";

export function quoteObservationLines(quote: {
  warrantyMonths?: number;
  installmentCount?: number;
  installmentInterestFree?: boolean;
}): string[] {
  const lines: string[] = [];
  const months = Math.max(0, Math.floor(quote.warrantyMonths ?? 0));
  const cuotas = Math.max(0, Math.floor(quote.installmentCount ?? 0));

  if (months > 0) {
    lines.push(`Garantía de ${months} ${months === 1 ? "mes" : "meses"}`);
  }

  if (cuotas > 0) {
    const label = `${cuotas} ${cuotas === 1 ? "cuota" : "cuotas"}`;
    lines.push(
      quote.installmentInterestFree ? `${label} Sin Interés` : label,
    );
  }

  return lines;
}

export function defaultQuoteMeta(quote?: Partial<Quote>) {
  return {
    discountPercent: quote?.discountPercent ?? 0,
    warrantyMonths: quote?.warrantyMonths ?? 0,
    installmentCount: quote?.installmentCount ?? 0,
    installmentInterestFree: Boolean(quote?.installmentInterestFree),
  };
}
