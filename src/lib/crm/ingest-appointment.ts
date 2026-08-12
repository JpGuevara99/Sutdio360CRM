import { db } from "@/lib/db";
import { getAppUrl } from "@/lib/env";
import { isGoogleConfigured } from "@/lib/google/auth";
import {
  annotateCalendarEvent,
  isLikelyAppointmentBooking,
  listRecentCalendarEvents,
  parseAppointmentEvent,
  type ParsedAppointment,
} from "@/lib/google/calendar";
import { ensureProjectDriveFolder } from "@/lib/crm/drive-sync";
import { formatEntityCode } from "@/lib/crm/project-codes";
import { upsertClient } from "@/lib/crm/upsert-client";

async function materializeAppointment(parsed: ParsedAppointment) {
  const existing = await db.getProjectByCalendarEventId(parsed.calendarEventId);
  if (existing) {
    await db.updateClient(existing.client.id, {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: parsed.email,
      phone: parsed.phone,
      address: parsed.address,
    });

    const visit = existing.visits[0];
    if (visit) {
      await db.updateVisit(visit.id, {
        bookedAt: parsed.bookedAt,
        scheduledAt: parsed.scheduledAt,
        notes: parsed.rawDescription ?? visit.notes,
      });
    }

    await db.updateProject(existing.id, {
      title: `Visita técnica — ${parsed.firstName} ${parsed.lastName}`.trim(),
    });

    const refreshed = await db.getProjectById(existing.id);
    return { project: refreshed ?? existing, created: false };
  }

  const client = await upsertClient({
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    email: parsed.email,
    phone: parsed.phone,
    address: parsed.address,
  });

  const publicCode = await db.nextPublicCode();

  const project = await db.createProject({
    publicCode,
    clientId: client.id,
    status: "RESERVADO",
    title: `Visita técnica — ${client.firstName} ${client.lastName}`.trim(),
    calendarEventId: parsed.calendarEventId,
  });

  await db.createVisit({
    projectId: project.id,
    scheduledAt: parsed.scheduledAt,
    bookedAt: parsed.bookedAt,
    durationMin: parsed.durationMin,
    timezone: "America/Santiago",
    source: "APPOINTMENT_SCHEDULE",
    notes: parsed.rawDescription,
  });

  await ensureProjectDriveFolder(project.id);

  if (isGoogleConfigured()) {
    try {
      await annotateCalendarEvent({
        eventId: parsed.calendarEventId,
        publicCode: formatEntityCode(project.publicCode),
        projectUrl: `${getAppUrl()}/proyectos/${project.id}`,
        address: parsed.address,
      });
    } catch (error) {
      console.error("Failed to annotate calendar event", error);
    }
  }

  const refreshed = await db.getProjectById(project.id);
  if (!refreshed) {
    throw new Error("Project missing after create");
  }

  return { project: refreshed, created: true };
}

export async function syncAppointmentsFromCalendar(options?: {
  forceFull?: boolean;
}) {
  if (!isGoogleConfigured()) {
    return {
      ok: false as const,
      error: "Google Calendar is not configured",
      created: 0,
      skipped: 0,
      scanned: 0,
    };
  }

  const syncToken = options?.forceFull
    ? null
    : await db.getCalendarSyncToken();

  const { events, nextSyncToken } = await listRecentCalendarEvents({
    syncToken,
  });

  let created = 0;
  let skipped = 0;
  const samples: string[] = [];

  for (const event of [...events].sort((a, b) => {
    // Asignar P- por orden de reserva (created), no por fecha de visita
    const aCreated = a.created ? new Date(a.created).getTime() : 0;
    const bCreated = b.created ? new Date(b.created).getTime() : 0;
    if (aCreated !== bCreated) return aCreated - bCreated;
    const aStart = a.start?.dateTime ?? a.start?.date ?? "";
    const bStart = b.start?.dateTime ?? b.start?.date ?? "";
    return aStart.localeCompare(bStart);
  })) {
    const parsed = parseAppointmentEvent(event);
    if (!parsed) {
      skipped += 1;
      continue;
    }

    if (!isLikelyAppointmentBooking(event, parsed)) {
      skipped += 1;
      if (samples.length < 5) {
        samples.push(
          `${parsed.scheduledAt.toISOString().slice(0, 16)} · ${parsed.summary || "(sin título)"}`,
        );
      }
      continue;
    }

    const result = await materializeAppointment(parsed);
    if (result.created) created += 1;
    else skipped += 1;
  }

  // Only persist sync token on incremental syncs; full window scans stay window-based
  if (nextSyncToken && syncToken) {
    await db.setCalendarSyncToken(nextSyncToken);
  }

  return {
    ok: true as const,
    created,
    skipped,
    scanned: events.length,
    hint:
      created === 0
        ? "Si tu cita de las 9:00 no apareció, revisa que esté en el Calendar de contacto@studio360.cl y vuelve a sincronizar."
        : null,
    skippedSamples: samples,
  };
}

export async function ingestSingleParsedAppointment(
  parsed: ParsedAppointment,
) {
  return materializeAppointment(parsed);
}
