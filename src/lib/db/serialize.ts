import { randomBytes } from "crypto";

export function createId(prefix?: string): string {
  const id = randomBytes(12).toString("hex");
  return prefix ? `${prefix}_${id}` : id;
}

export function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === "string" || typeof value === "number") {
    return new Date(value);
  }
  return new Date();
}

export function stripUndefined<T extends Record<string, unknown>>(
  obj: T,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...obj };
  for (const key of Object.keys(next)) {
    if (next[key] === undefined) {
      delete next[key];
    }
  }
  return next;
}
