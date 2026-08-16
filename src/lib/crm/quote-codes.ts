import { formatEntityCode } from "@/lib/crm/project-codes";

/** Dígitos del código de proyecto (P-12 → "12", P-120 → "120"). */
export function projectCodeDigits(publicCode: string): string {
  const formatted = formatEntityCode(publicCode.trim());
  const match = formatted.match(/^P-(\d+)$/i);
  if (match) return match[1];
  const loose = publicCode.trim().match(/^P-?(\d+)$/i);
  return loose?.[1] ?? (publicCode.replace(/\D/g, "") || "0");
}

/**
 * Código de cotización (sin la palabra "Cotización").
 * Proyecto P-12, seq 1 → P1201; P-120, seq 1 → P12001.
 */
export function buildQuoteCode(
  projectPublicCode: string,
  sequenceNumber: number,
): string {
  const seq = Math.max(1, Math.floor(sequenceNumber));
  return `P${projectCodeDigits(projectPublicCode)}${String(seq).padStart(2, "0")}`;
}

/** Etiqueta para UI/PDF: Cotización #P1201 */
export function formatQuoteCodeLabel(quoteCode: string): string {
  const code = quoteCode.trim().replace(/^#/, "");
  return `Cotización #${code}`;
}

/** Prefijo exacto del proyecto para parsear secuencias (evita P12 vs P120). */
export function quoteCodePrefix(projectPublicCode: string): string {
  return `P${projectCodeDigits(projectPublicCode)}`;
}

export function parseQuoteSequence(
  quoteCode: string,
  projectPublicCode: string,
): number | null {
  const prefix = quoteCodePrefix(projectPublicCode);
  const code = quoteCode.trim().replace(/^#/, "");
  const match = code.match(new RegExp(`^${prefix}(\\d{2})$`, "i"));
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

export function nextQuoteSequence(
  existingQuoteCodes: Array<string | null | undefined>,
  projectPublicCode: string,
): number {
  let max = 0;
  for (const raw of existingQuoteCodes) {
    if (!raw) continue;
    const seq = parseQuoteSequence(raw, projectPublicCode);
    if (seq != null) max = Math.max(max, seq);
  }
  return max + 1;
}
