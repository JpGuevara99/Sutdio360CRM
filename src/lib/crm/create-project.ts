import { db } from "@/lib/db";
import { ensureClientDriveFolder, ensureProjectDriveFolder } from "@/lib/crm/drive-sync";
import { clientFullName } from "@/lib/crm/labels";
import type { ProjectWithRelations, VisitSource } from "@/lib/crm/types";

export type NewClientInput = {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

export type CreateProjectInput = {
  /** Cliente nuevo (código nuevo) o cliente existente (mantiene su código) */
  client: { id: string } | NewClientInput;
  title?: string | null;
  /** Si se agenda una visita, se registra junto al proyecto */
  scheduledAt?: Date | null;
  durationMin?: number | null;
  source?: VisitSource | null;
  notes?: string | null;
};

function isExistingClient(
  client: CreateProjectInput["client"],
): client is { id: string } {
  return "id" in client;
}

/**
 * Crea un proyecto manual con su código público, sobre un cliente nuevo o uno
 * existente, y opcionalmente agenda la visita inicial.
 */
export async function createProjectForClient(
  input: CreateProjectInput,
): Promise<ProjectWithRelations> {
  let clientId: string;
  let clientLabel: string;

  if (isExistingClient(input.client)) {
    const client = await db.getClientById(input.client.id);
    if (!client || client.deletedAt) {
      throw new Error("El cliente no existe o está en la papelera");
    }
    clientId = client.id;
    clientLabel = clientFullName(client);
  } else {
    const created = await db.upsertClient({
      firstName: input.client.firstName,
      lastName: input.client.lastName,
      email: input.client.email ?? null,
      phone: input.client.phone ?? null,
      address: input.client.address ?? null,
    });
    clientId = created.id;
    clientLabel = clientFullName(created);
  }

  const publicCode = await db.nextPublicCode();
  const title = input.title?.trim()
    ? input.title.trim()
    : input.scheduledAt
      ? `Visita técnica — ${clientLabel}`.trim()
      : `Proyecto — ${clientLabel}`.trim();

  const project = await db.createProject({
    publicCode,
    clientId,
    status: "RESERVADO",
    title,
  });

  if (input.scheduledAt) {
    await db.createVisit({
      projectId: project.id,
      scheduledAt: input.scheduledAt,
      bookedAt: new Date(),
      durationMin: input.durationMin ?? 60,
      timezone: "America/Santiago",
      source: input.source ?? "MANUAL",
      notes: input.notes ?? null,
    });
  } else if (input.notes?.trim()) {
    await db.createProjectNote({
      projectId: project.id,
      body: input.notes.trim(),
    });
  }

  await ensureProjectDriveFolder(project.id);

  const full = await db.getProjectById(project.id);
  if (!full) {
    throw new Error("No se pudo cargar el proyecto creado");
  }
  return full;
}

/** Crea un cliente suelto (con su código y carpeta de Drive). */
export async function createClient(input: NewClientInput) {
  const client = await db.upsertClient({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email ?? null,
    phone: input.phone ?? null,
    address: input.address ?? null,
  });

  try {
    return await ensureClientDriveFolder(client.id);
  } catch (error) {
    console.error("createClient: ensure Drive folder failed", error);
    return client;
  }
}
