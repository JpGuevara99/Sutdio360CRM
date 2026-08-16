/** Ventana para poder eliminar una cotización (48 horas desde createdAt). */
export const QUOTE_DELETE_WINDOW_MS = 48 * 60 * 60 * 1000;

export function canDeleteQuote(createdAt: Date | string, now = new Date()): boolean {
  const created =
    createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  return now.getTime() - created.getTime() < QUOTE_DELETE_WINDOW_MS;
}

export function quoteDeleteRemainingMs(
  createdAt: Date | string,
  now = new Date(),
): number {
  const created =
    createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 0;
  return Math.max(0, QUOTE_DELETE_WINDOW_MS - (now.getTime() - created.getTime()));
}
