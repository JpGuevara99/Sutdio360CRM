import type { FollowUpSettings, ProjectStatus } from "@/lib/crm/types";

/** Tope duro de seguimientos configurables. */
export const FOLLOW_UP_LIMIT = 8;

/** Días máximos de espera entre seguimientos. */
export const FOLLOW_UP_MAX_DAYS = 365;

export const DEFAULT_FOLLOW_UP_SETTINGS: FollowUpSettings = {
  count: 4,
  intervalDays: [3, 7, 15, 30],
  updatedAt: new Date(0),
};

export function sanitizeFollowUpSettings(input: {
  count?: unknown;
  intervalDays?: unknown;
  updatedAt?: Date | string | null;
}): FollowUpSettings {
  const rawCount = Number(input.count);
  const count =
    Number.isFinite(rawCount) && rawCount >= 1
      ? Math.min(FOLLOW_UP_LIMIT, Math.floor(rawCount))
      : DEFAULT_FOLLOW_UP_SETTINGS.count;

  const rawDays = Array.isArray(input.intervalDays) ? input.intervalDays : [];
  const intervalDays: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const value = Number(rawDays[i]);
    const fallback = DEFAULT_FOLLOW_UP_SETTINGS.intervalDays[i] ?? 7;
    intervalDays.push(
      Number.isFinite(value) && value >= 1
        ? Math.min(FOLLOW_UP_MAX_DAYS, Math.floor(value))
        : fallback,
    );
  }

  return {
    count,
    intervalDays,
    updatedAt: input.updatedAt ? new Date(input.updatedAt) : new Date(),
  };
}

export function isFollowUpStopped(status: ProjectStatus): boolean {
  return status === "APROBADO" || status === "RECHAZADO";
}

export function clampFollowUpCount(value: unknown, max = FOLLOW_UP_LIMIT): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(max, Math.floor(n));
}

/** Siguiente número de la secuencia, o null si ya se completó. */
export function nextFollowUpNumber(
  current: number,
  settings: FollowUpSettings,
): number | null {
  const done = clampFollowUpCount(current, settings.count);
  if (done >= settings.count) return null;
  return done + 1;
}

/** Días de espera antes del seguimiento N (1-based). */
export function intervalDaysFor(
  followUpNumber: number,
  settings: FollowUpSettings,
): number {
  const index = Math.max(1, Math.floor(followUpNumber)) - 1;
  return (
    settings.intervalDays[index] ??
    settings.intervalDays[settings.intervalDays.length - 1] ??
    7
  );
}

export function dueDateForFollowUp(
  followUpNumber: number,
  settings: FollowUpSettings,
  from = new Date(),
): Date {
  const due = new Date(from.getTime());
  due.setUTCDate(due.getUTCDate() + intervalDaysFor(followUpNumber, settings));
  return due;
}

/** Convierte teléfono local/Chile a dígitos wa.me, o null. */
export function whatsappLinkFromPhone(
  phone: string | null | undefined,
): string | null {
  if (!phone?.trim()) return null;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.startsWith("56")) {
    // ok
  } else if (digits.length === 9 && digits.startsWith("9")) {
    digits = `56${digits}`;
  } else if (digits.length === 8) {
    digits = `569${digits}`;
  } else {
    digits = `56${digits}`;
  }
  if (digits.length < 11) return null;
  return `https://wa.me/${digits}`;
}

export function followUpTaskTitle(options: {
  followUpNumber: number;
  projectCode: string;
  clientName: string;
}): string {
  return `Seguimiento #${options.followUpNumber} · ${options.projectCode} · ${options.clientName}`;
}

export function followUpTaskNotes(options: {
  followUpNumber: number;
  clientName: string;
  phone: string | null | undefined;
  projectUrl?: string | null;
}): string {
  const link = whatsappLinkFromPhone(options.phone);
  const lines = [
    `Realizar seguimiento #${options.followUpNumber} a ${options.clientName}.`,
    link ? `WhatsApp: ${link}` : "No tienes un número asignado a este cliente",
  ];
  if (options.projectUrl) lines.push(`Ficha: ${options.projectUrl}`);
  return lines.join("\n");
}
