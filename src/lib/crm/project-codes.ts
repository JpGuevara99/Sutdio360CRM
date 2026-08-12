/** Códigos públicos: P-01, P-09, P-120 / C-01, C-120 — módulo seguro para cliente */
const CODE_MIN_DIGITS = 2;

export function formatEntityCode(code: string): string {
  const match = code.trim().match(/^(P|C|L)-(\d+)$/i);
  if (!match) return code;
  const prefix = match[1].toUpperCase() === "L" ? "C" : match[1].toUpperCase();
  const value = Number(match[2]);
  if (!Number.isFinite(value)) return code;
  return `${prefix}-${String(value).padStart(CODE_MIN_DIGITS, "0")}`;
}

export function buildEntityCode(prefix: "P" | "C", sequence: number): string {
  return `${prefix}-${String(sequence).padStart(CODE_MIN_DIGITS, "0")}`;
}
