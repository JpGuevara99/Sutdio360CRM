import { db } from "@/lib/db";
import { ensureClientDriveFolder } from "@/lib/crm/drive-sync";
import { formatEntityCode } from "@/lib/crm/project-codes";
import type { ClientMergePreview } from "@/lib/crm/merge-clients-types";
import type { Client, ClientWithProjects } from "@/lib/crm/types";
import { isGoogleConfigured } from "@/lib/google/auth";
import { moveDriveFolder, trashDriveFile } from "@/lib/google/drive";

export type { ClientMergePreview } from "@/lib/crm/merge-clients-types";

function createdAtMs(value: Date | string): number {
  const d = value instanceof Date ? value : new Date(value);
  return d.getTime();
}

function clientDisplayName(client: Client): string {
  return `${client.firstName} ${client.lastName}`.trim() || client.leadCode;
}

/** El keeper es siempre el cliente más antiguo (createdAt). */
export function pickOldestKeeper(clients: Client[]): Client {
  if (clients.length === 0) {
    throw new Error("No clients");
  }
  return [...clients].sort(
    (a, b) => createdAtMs(a.createdAt) - createdAtMs(b.createdAt),
  )[0]!;
}

export async function previewClientMerge(
  clientIds: string[],
): Promise<ClientMergePreview> {
  const uniqueIds = [...new Set(clientIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length < 2) {
    throw new Error("Se necesitan al menos 2 clientes");
  }

  const loaded: ClientWithProjects[] = [];
  for (const id of uniqueIds) {
    const client = await db.getClientWithProjects(id);
    if (!client) {
      throw new Error(`Cliente no encontrado: ${id}`);
    }
    loaded.push(client);
  }

  const keeper = pickOldestKeeper(loaded);
  const mergeClients = loaded.filter((c) => c.id !== keeper.id);
  const projects = loaded.flatMap((client) =>
    client.projects.map((project) => ({
      ...project,
      fromClientId: client.id,
      fromClientCode: formatEntityCode(client.leadCode),
      fromClientName: clientDisplayName(client),
    })),
  );

  return { keeper, mergeClients, projects };
}

export async function mergeClients(input: {
  keeperId: string;
  mergeIds: string[];
}): Promise<ClientWithProjects> {
  const mergeIds = [
    ...new Set(input.mergeIds.map((id) => id.trim()).filter(Boolean)),
  ].filter((id) => id !== input.keeperId);

  if (mergeIds.length < 1) {
    throw new Error("Se necesita al menos un cliente a combinar");
  }

  const preview = await previewClientMerge([input.keeperId, ...mergeIds]);
  if (preview.keeper.id !== input.keeperId) {
    throw new Error(
      "El cliente que se conserva debe ser el más antiguo del grupo",
    );
  }

  let keeperFolderId = preview.keeper.driveFolderId;
  if (isGoogleConfigured()) {
    try {
      const ensured = await ensureClientDriveFolder(preview.keeper.id);
      keeperFolderId = ensured.driveFolderId;
    } catch (error) {
      console.error("mergeClients: ensure keeper Drive folder failed", error);
    }
  }

  for (const project of preview.projects) {
    if (project.clientId === preview.keeper.id) continue;

    if (
      isGoogleConfigured() &&
      keeperFolderId &&
      project.driveFolderId
    ) {
      try {
        await moveDriveFolder({
          folderId: project.driveFolderId,
          newParentId: keeperFolderId,
        });
      } catch (error) {
        console.error(
          `mergeClients: move project folder ${project.id} failed`,
          error,
        );
      }
    }

    await db.updateProject(project.id, { clientId: preview.keeper.id });
  }

  for (const client of preview.mergeClients) {
    if (isGoogleConfigured() && client.driveFolderId) {
      try {
        await trashDriveFile(client.driveFolderId);
      } catch (error) {
        console.error(
          `mergeClients: trash client folder ${client.id} failed`,
          error,
        );
      }
    }
    await db.deleteClient(client.id);
  }

  const result = await db.getClientWithProjects(preview.keeper.id);
  if (!result) {
    throw new Error("Keeper not found after merge");
  }
  return result;
}
