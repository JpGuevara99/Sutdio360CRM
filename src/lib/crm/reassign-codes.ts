import { db } from "@/lib/db";
import { buildEntityCode, formatEntityCode } from "@/lib/crm/project-codes";
import {
  getDriveFolderName,
  renameDriveFolder,
} from "@/lib/google/drive";
import { isGoogleConfigured } from "@/lib/google/auth";
import type { ProjectWithRelations } from "@/lib/crm/types";

function projectBookedAt(project: ProjectWithRelations): number {
  const visits = project.visits ?? [];
  if (visits.length === 0) return project.createdAt.getTime();
  let min = Number.POSITIVE_INFINITY;
  for (const visit of visits) {
    const t = (visit.bookedAt ?? visit.createdAt).getTime();
    if (t < min) min = t;
  }
  return Number.isFinite(min) ? min : project.createdAt.getTime();
}

function clientFolderNameFrom(
  leadCode: string,
  firstName: string,
  lastName: string,
): string {
  const name = `${firstName} ${lastName}`.trim();
  return `${formatEntityCode(leadCode)} - ${name}`.trim();
}

function projectChildName(publicCode: string, title?: string | null): string {
  const code = formatEntityCode(publicCode);
  const shortTitle = title?.trim();
  if (!shortTitle) return code;
  if (/^visita\s+t[eé]cnica/i.test(shortTitle)) return code;
  const clipped =
    shortTitle.length > 60 ? `${shortTitle.slice(0, 57)}…` : shortTitle;
  return `${code} - ${clipped}`;
}

/**
 * Reasigna P- y C- por orden de agendado (bookedAt).
 * Uso puntual de corrección; en operación normal los códigos no se modifican.
 */
export async function reassignCodesByBookedAt(): Promise<{
  projects: Array<{ id: string; from: string; to: string }>;
  clients: Array<{ id: string; from: string; to: string }>;
  foldersRenamed: number;
  folderErrors: string[];
}> {
  const projects = await db.listProjects();
  const sortedProjects = [...projects].sort((a, b) => {
    const diff = projectBookedAt(a) - projectBookedAt(b);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });

  const projectChanges: Array<{ id: string; from: string; to: string }> = [];
  for (let i = 0; i < sortedProjects.length; i += 1) {
    const project = sortedProjects[i];
    const to = buildEntityCode("P", i + 1);
    const from = project.publicCode;
    if (from !== to) {
      await db.setProjectPublicCode(project.id, to);
      projectChanges.push({ id: project.id, from, to });
    }
    project.publicCode = to;
  }

  // Clientes por primera reserva (bookedAt del proyecto más antiguo)
  const clientFirstBooked = new Map<string, number>();
  const clientRef = new Map<string, ProjectWithRelations["client"]>();
  for (const project of sortedProjects) {
    clientRef.set(project.clientId, project.client);
    const booked = projectBookedAt(project);
    const prev = clientFirstBooked.get(project.clientId);
    if (prev == null || booked < prev) {
      clientFirstBooked.set(project.clientId, booked);
    }
  }

  // Incluir clientes sin proyectos (al final, por createdAt)
  const allClients = await db.listClients();
  for (const client of allClients) {
    if (!clientFirstBooked.has(client.id)) {
      clientRef.set(client.id, client);
      clientFirstBooked.set(client.id, client.createdAt.getTime() + 1e15);
    }
  }

  const sortedClientIds = [...clientFirstBooked.entries()]
    .sort((a, b) => {
      if (a[1] !== b[1]) return a[1] - b[1];
      return a[0].localeCompare(b[0]);
    })
    .map(([id]) => id);

  const clientChanges: Array<{ id: string; from: string; to: string }> = [];
  for (let i = 0; i < sortedClientIds.length; i += 1) {
    const id = sortedClientIds[i];
    const client = clientRef.get(id);
    if (!client) continue;
    const to = buildEntityCode("C", i + 1);
    const from = client.leadCode;
    if (from !== to) {
      await db.setClientLeadCode(id, to);
      clientChanges.push({ id, from, to });
    }
    client.leadCode = to;
  }

  await db.setCodeSequences({
    projectValue: sortedProjects.length,
    leadValue: sortedClientIds.length,
  });

  let foldersRenamed = 0;
  const folderErrors: string[] = [];

  if (isGoogleConfigured()) {
    for (const id of sortedClientIds) {
      const client = clientRef.get(id);
      if (!client?.driveFolderId) continue;
      const desired = clientFolderNameFrom(
        client.leadCode,
        client.firstName,
        client.lastName,
      );
      try {
        const current = await getDriveFolderName(client.driveFolderId);
        if (current !== desired) {
          await renameDriveFolder({
            folderId: client.driveFolderId,
            name: desired,
          });
          foldersRenamed += 1;
        }
      } catch (error) {
        folderErrors.push(
          `Cliente ${client.leadCode}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    for (const project of sortedProjects) {
      if (!project.driveFolderId) continue;
      const desired = projectChildName(project.publicCode, project.title);
      try {
        const current = await getDriveFolderName(project.driveFolderId);
        if (current !== desired) {
          await renameDriveFolder({
            folderId: project.driveFolderId,
            name: desired,
          });
          foldersRenamed += 1;
        }
      } catch (error) {
        folderErrors.push(
          `Proyecto ${project.publicCode}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  return {
    projects: projectChanges,
    clients: clientChanges,
    foldersRenamed,
    folderErrors,
  };
}
