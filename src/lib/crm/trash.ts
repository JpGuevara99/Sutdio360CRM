import { db } from "@/lib/db";
import {
  TRASH_RETENTION_DAYS,
  type TrashedClient,
  type TrashedProject,
} from "@/lib/crm/types";
import { isGoogleConfigured } from "@/lib/google/auth";
import {
  deleteDriveFileForever,
  trashDriveFile,
  untrashDriveFile,
} from "@/lib/google/drive";

export type TrashContents = {
  clients: TrashedClient[];
  /** Proyectos borrados por su cuenta (los borrados con su cliente van anidados) */
  projects: TrashedProject[];
  retentionDays: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fecha en que un elemento enviado a la papelera se descarta */
export function trashExpiresAt(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * DAY_MS);
}

/** Días restantes antes del descarte automático (0 si ya venció) */
export function trashDaysLeft(deletedAt: Date, now = new Date()): number {
  const diff = trashExpiresAt(deletedAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / DAY_MS));
}

async function driveTrash(folderId: string | null) {
  if (!folderId || !isGoogleConfigured()) return;
  try {
    await trashDriveFile(folderId);
  } catch (error) {
    console.error(`trash: no se pudo enviar ${folderId} a la papelera`, error);
  }
}

async function driveUntrash(folderId: string | null) {
  if (!folderId || !isGoogleConfigured()) return;
  try {
    await untrashDriveFile(folderId);
  } catch (error) {
    console.error(`trash: no se pudo restaurar ${folderId} en Drive`, error);
  }
}

async function driveDeleteForever(folderId: string | null) {
  if (!folderId || !isGoogleConfigured()) return;
  try {
    await deleteDriveFileForever(folderId);
  } catch (error) {
    console.error(`trash: no se pudo borrar ${folderId} en Drive`, error);
  }
}

/** Envía un proyecto a la papelera (90 días) junto con su carpeta de Drive. */
export async function trashProject(projectId: string): Promise<void> {
  const project = await db.getProjectById(projectId);
  if (!project) throw new Error("Proyecto no encontrado");
  if (project.deletedAt) return;

  await db.setProjectTrashed(projectId, { deletedAt: new Date() });
  await driveTrash(project.driveFolderId);
}

/** Envía un cliente y todos sus proyectos a la papelera. */
export async function trashClient(clientId: string): Promise<void> {
  const client = await db.getClientById(clientId);
  if (!client) throw new Error("Cliente no encontrado");
  if (client.deletedAt) return;

  const projects = await db.listProjectsByClientId(clientId);
  const now = new Date();
  for (const project of projects) {
    await db.setProjectTrashed(project.id, {
      deletedAt: now,
      deletedWithClient: true,
    });
  }
  await db.setClientTrashed(clientId, now);

  // La carpeta del cliente contiene las de sus proyectos: basta con enviarla
  await driveTrash(client.driveFolderId);
}

/** Restaura un proyecto (y su cliente, si también estaba en la papelera). */
export async function restoreProject(projectId: string): Promise<void> {
  const project = await db.getProjectById(projectId);
  if (!project) throw new Error("Proyecto no encontrado");

  const client = await db.getClientById(project.clientId);
  if (client?.deletedAt) {
    await db.setClientTrashed(client.id, null);
    await driveUntrash(client.driveFolderId);
  }

  await db.setProjectTrashed(projectId, { deletedAt: null });
  await driveUntrash(project.driveFolderId);
}

/** Restaura un cliente y los proyectos que arrastró al eliminarlo. */
export async function restoreClient(clientId: string): Promise<void> {
  const client = await db.getClientById(clientId);
  if (!client) throw new Error("Cliente no encontrado");

  const projects = await db.listProjectsByClientId(clientId, {
    includeDeleted: true,
  });
  for (const project of projects) {
    if (project.deletedAt && project.deletedWithClient) {
      await db.setProjectTrashed(project.id, { deletedAt: null });
      await driveUntrash(project.driveFolderId);
    }
  }

  await db.setClientTrashed(clientId, null);
  await driveUntrash(client.driveFolderId);
}

/** Borra un proyecto para siempre, con su carpeta de Drive. */
export async function purgeProject(projectId: string): Promise<void> {
  // Sin `getProjectById`: ese lookup exige que el cliente siga existiendo
  const trashed = await db.listTrashedProjects();
  const project = trashed.find((p) => p.id === projectId);
  await driveDeleteForever(project?.driveFolderId ?? null);
  await db.hardDeleteProject(projectId);
}

/** Borra un cliente para siempre, con sus proyectos y carpetas de Drive. */
export async function purgeClient(clientId: string): Promise<void> {
  const client = await db.getClientById(clientId);
  if (!client) return;
  const projects = await db.listProjectsByClientId(clientId, {
    includeDeleted: true,
  });
  for (const project of projects) {
    await db.hardDeleteProject(project.id);
  }
  await driveDeleteForever(client.driveFolderId);
  await db.hardDeleteClient(clientId);
}

/** Contenido actual de la papelera, sin duplicar proyectos borrados con su cliente. */
export async function getTrashContents(): Promise<TrashContents> {
  const [clients, projects] = await Promise.all([
    db.listTrashedClients(),
    db.listTrashedProjects(),
  ]);
  const trashedClientIds = new Set(clients.map((c) => c.id));
  return {
    clients,
    projects: projects.filter(
      (p) => !(p.deletedWithClient && trashedClientIds.has(p.clientId)),
    ),
    retentionDays: TRASH_RETENTION_DAYS,
  };
}

export async function restoreAllTrash(): Promise<{
  clients: number;
  projects: number;
}> {
  const { clients, projects } = await getTrashContents();
  for (const client of clients) {
    await restoreClient(client.id);
  }
  for (const project of projects) {
    await restoreProject(project.id);
  }
  return { clients: clients.length, projects: projects.length };
}

export async function purgeAllTrash(): Promise<{
  clients: number;
  projects: number;
}> {
  const { clients, projects } = await getTrashContents();
  for (const project of projects) {
    await purgeProject(project.id);
  }
  for (const client of clients) {
    await purgeClient(client.id);
  }
  return { clients: clients.length, projects: projects.length };
}

/** Descarta lo que ya cumplió los 90 días. Se llama al abrir la papelera. */
export async function purgeExpiredTrash(now = new Date()): Promise<{
  clients: number;
  projects: number;
}> {
  const { clients, projects } = await getTrashContents();
  let purgedClients = 0;
  let purgedProjects = 0;

  for (const project of projects) {
    if (project.deletedAt && trashExpiresAt(project.deletedAt) <= now) {
      await purgeProject(project.id);
      purgedProjects += 1;
    }
  }
  for (const client of clients) {
    if (client.deletedAt && trashExpiresAt(client.deletedAt) <= now) {
      await purgeClient(client.id);
      purgedClients += 1;
    }
  }

  return { clients: purgedClients, projects: purgedProjects };
}
