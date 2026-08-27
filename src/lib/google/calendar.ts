import { google, type calendar_v3 } from "googleapis";
import { getCalendarId, getGoogleAuth } from "@/lib/google/auth";

const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

export type ParsedAppointment = {
  calendarEventId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  scheduledAt: Date;
  /** Momento en que el cliente reservó en Google (event.created) */
  bookedAt: Date;
  durationMin: number;
  htmlLink: string | null;
  rawDescription: string | null;
  summary: string;
};

function getCalendarClient() {
  const auth = getGoogleAuth(CALENDAR_SCOPES);
  return google.calendar({ version: "v3", auth });
}

function stripHtml(input: string): string {
  return input
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n")
    .replace(/<\/\s*div\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikeLabel(value: string): boolean {
  return /^(first name|last name|email|phone|tel[eé]fono|direcci[oó]n|address|nombre|apellido|correo)/i.test(
    value.trim(),
  );
}

function extractField(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const sameLine = new RegExp(`${escaped}\\s*[:：]\\s*(.+)`, "i");
    const m1 = text.match(sameLine);
    if (m1?.[1]) {
      const val = m1[1].trim().split("\n")[0]?.trim() ?? "";
      if (val && !looksLikeLabel(val)) return val;
    }

    // Google Appointment Schedule: <b>Label</b><br>Value
    const nextLine = new RegExp(`${escaped}\\s*\\n+\\s*(.+)`, "i");
    const m2 = text.match(nextLine);
    if (m2?.[1]) {
      const val = m2[1].trim().split("\n")[0]?.trim() ?? "";
      if (val && !looksLikeLabel(val)) return val;
    }
  }
  return null;
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Cliente", lastName: "Sin Nombre" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

/** "STUDIO 360 (Juan Guevara)" -> Juan Guevara */
function nameFromSummary(summary: string): { firstName: string; lastName: string } {
  let cleaned = summary.trim();
  const paren = cleaned.match(/\(([^)]+)\)/);
  if (paren?.[1]) {
    cleaned = paren[1].trim();
  } else {
    cleaned = cleaned
      .replace(/^studio\s*360\s*/i, "")
      .replace(/^[-–:|]\s*/, "")
      .replace(/^appointment with\s+/i, "")
      .replace(/^cita con\s+/i, "")
      .replace(/\s*[-–].*$/, "")
      .trim();
  }

  if (/^studio\s*360$/i.test(cleaned) || !cleaned) {
    return { firstName: "Cliente", lastName: "Nuevo" };
  }

  return splitName(cleaned);
}

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "").trim();
}

function cleanPersonPart(value: string): string {
  return value.replace(/^[.\s,]+|[.\s,]+$/g, "").trim();
}

/** "Programada por: Victor ., email@x.com, 56997..." */
function extractProgramadaPor(description: string): {
  name: string | null;
  email: string | null;
  phone: string | null;
} {
  const match = description.match(/programada por\s*:\s*([^\n]+)/i);
  if (!match?.[1]) {
    return { name: null, email: null, phone: null };
  }

  const parts = match[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  let name: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;

  for (const part of parts) {
    if (part.includes("@")) {
      email = part.toLowerCase();
      continue;
    }
    const digits = part.replace(/\D/g, "");
    if (/^[\d\s+\-()]+$/.test(part) && digits.length >= 8) {
      phone = normalizePhone(part);
      continue;
    }
    if (!name) {
      name = cleanPersonPart(part);
    }
  }

  return { name, email, phone };
}

function extractEmailLoose(description: string): string | null {
  const fromProgramada = extractProgramadaPor(description).email;
  if (fromProgramada) return fromProgramada;

  const matches = description.match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  );
  if (!matches?.length) return null;

  const preferred = matches.find(
    (email) =>
      !/localhost|example\.com|sentry|noreply/i.test(email) &&
      !email.toLowerCase().includes("firebase"),
  );
  return (preferred ?? matches[0])?.toLowerCase() ?? null;
}

/** Google a veces pone el teléfono en "Programada por: Nombre, email, 998448259" */
function extractPhoneLoose(description: string): string | null {
  const fromProgramada = extractProgramadaPor(description).phone;
  if (fromProgramada) return fromProgramada;

  for (const line of description.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.includes("@") || /https?:/i.test(trimmed)) continue;
    if (/studio360|crm:|proyecto|programada por/i.test(trimmed)) continue;
    if (!/^[\d\s+\-()]+$/.test(trimmed)) continue;
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) {
      return normalizePhone(trimmed);
    }
  }

  return null;
}

export { stripHtml };

export function isLikelyAppointmentBooking(
  event: calendar_v3.Schema$Event,
  parsed: ParsedAppointment,
): boolean {
  const summary = event.summary ?? "";
  const description = stripHtml(event.description ?? "");

  // Formulario de reserva de Google Appointment Schedule (link de citas).
  if (
    /email address|phone number|first name|last name|direcci[oó]n|tel[eé]fono/i.test(
      description,
    )
  ) {
    return true;
  }

  // Reserva en español: "Programada por: Nombre, email, teléfono".
  if (/programada por\s*:/i.test(description)) {
    return true;
  }

  if (
    /appointment schedule|booked an appointment|horario de citas|cita reservada|appointment with/i.test(
      `${summary}\n${description}`,
    )
  ) {
    return true;
  }

  // Re-sincronizar un lead que el CRM ya marcó en Calendar.
  if (/studio360 crm:/i.test(description)) {
    return true;
  }

  void parsed;
  return false;
}

export function parseAppointmentEvent(
  event: calendar_v3.Schema$Event,
): ParsedAppointment | null {
  if (!event.id || event.status === "cancelled") return null;

  const description = stripHtml(event.description ?? "");
  const location = event.location ?? "";
  const summary = event.summary ?? "";

  const programada = extractProgramadaPor(description);

  const email =
    extractField(description, [
      "Email address",
      "E-mail address",
      "Email",
      "E-mail",
      "Correo electrónico",
      "Correo electronico",
      "Correo",
    ]) ??
    programada.email ??
    event.attendees?.find((a) => !a.organizer && !a.self && a.email)?.email ??
    extractEmailLoose(description);

  const phone =
    extractField(description, [
      "Phone number",
      "Phone",
      "Teléfono",
      "Telefono",
      "Celular",
      "WhatsApp",
    ]) ??
    programada.phone ??
    extractPhoneLoose(description);

  const address =
    extractField(description, [
      "Dirección",
      "Direccion",
      "Address",
      "Location",
    ]) ?? (location || null);

  let firstName =
    extractField(description, ["First name", "Nombre"]) ?? "";
  let lastName =
    extractField(description, ["Last name", "Apellido"]) ?? "";

  if ((!firstName || !lastName) && programada.name) {
    const fromProgramada = splitName(programada.name);
    firstName = firstName || fromProgramada.firstName;
    lastName = lastName || fromProgramada.lastName;
  }

  // Avoid using booking page title as the person name
  if (/^studio\s*360$/i.test(firstName.trim()) || !firstName) {
    const fromSummary = nameFromSummary(summary);
    if (!firstName || /^studio\s*360$/i.test(firstName.trim())) {
      firstName = fromSummary.firstName;
      lastName = lastName || fromSummary.lastName;
    }
  }

  if (!firstName && !lastName) {
    const fromSummary = nameFromSummary(summary);
    firstName = fromSummary.firstName;
    lastName = fromSummary.lastName;
  } else if (firstName && !lastName) {
    // "Juan Guevara" sometimes comes only in First name
    const split = splitName(`${firstName}`.trim());
    if (split.lastName) {
      firstName = split.firstName;
      lastName = split.lastName;
    }
  }

  // Titles like "STUDIO 360 (Juan Guevara)" landed in name fields
  const combined = `${firstName} ${lastName}`.trim();
  if (
    /\(.*\)/.test(combined) ||
    /^studio\s*360\b/i.test(firstName) ||
    /^studio\s*360$/i.test(firstName.trim())
  ) {
    const cleaned = nameFromSummary(combined.includes("(") ? combined : summary);
    firstName = cleaned.firstName;
    lastName = cleaned.lastName;
  }

  const startRaw = event.start?.dateTime ?? event.start?.date;
  if (!startRaw) return null;
  const scheduledAt = new Date(startRaw);

  const endRaw = event.end?.dateTime ?? event.end?.date;
  let durationMin = 60;
  if (endRaw) {
    durationMin = Math.max(
      15,
      Math.round((new Date(endRaw).getTime() - scheduledAt.getTime()) / 60000),
    );
  }

  const bookedAt = event.created ? new Date(event.created) : new Date();

  return {
    calendarEventId: event.id,
    firstName: cleanPersonPart(firstName || "Cliente"),
    lastName: cleanPersonPart(lastName || ""),
    email: email?.toLowerCase() ?? null,
    phone,
    address,
    scheduledAt,
    bookedAt,
    durationMin,
    htmlLink: event.htmlLink ?? null,
    rawDescription: description || null,
    summary,
  };
}

export async function listRecentCalendarEvents(options?: {
  syncToken?: string | null;
  timeMin?: Date;
  timeMax?: Date;
}): Promise<{
  events: calendar_v3.Schema$Event[];
  nextSyncToken: string | null;
}> {
  const calendar = getCalendarClient();
  const calendarId = getCalendarId();

  try {
    if (options?.syncToken) {
      const res = await calendar.events.list({
        calendarId,
        syncToken: options.syncToken,
        singleEvents: true,
      });
      return {
        events: res.data.items ?? [],
        nextSyncToken: res.data.nextSyncToken ?? null,
      };
    }
  } catch (error) {
    const status = (error as { code?: number }).code;
    if (status !== 410) throw error;
  }

  const timeMin =
    options?.timeMin ?? new Date(Date.now() - 2 * 86400000);
  const timeMax =
    options?.timeMax ?? new Date(Date.now() + 60 * 86400000);

  const events: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  do {
    const res = await calendar.events.list({
      calendarId,
      singleEvents: true,
      orderBy: "startTime",
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: 250,
      pageToken,
    });
    events.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
    nextSyncToken = res.data.nextSyncToken ?? nextSyncToken;
  } while (pageToken);

  return { events, nextSyncToken };
}

export async function annotateCalendarEvent(options: {
  eventId: string;
  publicCode: string;
  projectUrl: string;
  address?: string | null;
}): Promise<void> {
  const calendar = getCalendarClient();
  const calendarId = getCalendarId();
  const existing = await calendar.events.get({
    calendarId,
    eventId: options.eventId,
  });

  const marker = `Studio360 CRM: ${options.publicCode}`;
  const description = existing.data.description ?? "";
  if (description.includes(marker)) return;

  const nextDescription = [
    description.trim(),
    "",
    marker,
    `Proyecto: ${options.projectUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  await calendar.events.patch({
    calendarId,
    eventId: options.eventId,
    requestBody: {
      description: nextDescription,
      location: options.address || existing.data.location || undefined,
    },
  });
}
