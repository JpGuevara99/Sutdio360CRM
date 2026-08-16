import { db } from "@/lib/db";
import type { VisitSource } from "@/lib/crm/types";
import { ensureProjectDriveFolder } from "@/lib/crm/drive-sync";
import { upsertClient } from "@/lib/crm/upsert-client";

export type ManualLeadInput = {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  scheduledAt: Date;
  durationMin?: number;
  source: VisitSource;
  notes?: string | null;
  title?: string | null;
};

export async function createManualLead(input: ManualLeadInput) {
  const client = await upsertClient({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    address: input.address,
  });

  const publicCode = await db.nextPublicCode();

  const project = await db.createProject({
    publicCode,
    clientId: client.id,
    status: "RESERVADO",
    title:
      input.title ??
      `Visita técnica — ${client.firstName} ${client.lastName}`.trim(),
  });

  const bookedAt = new Date();
  await db.createVisit({
    projectId: project.id,
    scheduledAt: input.scheduledAt,
    bookedAt,
    durationMin: input.durationMin ?? 60,
    timezone: "America/Santiago",
    source: input.source,
    notes: input.notes ?? null,
  });

  try {
    await ensureProjectDriveFolder(project.id);
  } catch (error) {
    console.error("createManualLead: Drive folder failed", error);
  }

  const full = await db.getProjectById(project.id);
  if (!full) {
    throw new Error("No se pudo cargar el proyecto creado");
  }
  return full;
}
