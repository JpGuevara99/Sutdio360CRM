import { timingSafeEqual } from "crypto";

/**
 * Compara el secreto de cron sin filtrar información por el tiempo que tarda
 * la comparación (`===` corta en el primer carácter distinto).
 */
export function isValidCronSecret(header: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !header) return false;

  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
