import { db } from "@/lib/db";
import { formatEntityCode } from "@/lib/crm/project-codes";
import type { Client, ProjectWithRelations } from "@/lib/crm/types";
import {
  createFolder,
  getDriveFolderName,
  getDriveFolderParents,
  moveDriveFolder,
  renameDriveFolder,
} from "@/lib/google/drive";
import { isGoogleConfigured } from "@/lib/google/auth";

function clientFolderName(client: Client): string {
  const name = `${client.firstName} ${client.lastName}`.trim();
  return `${formatEntityCode(client.leadCode)} - ${name}`.trim();
}

function projectChildFolderName(
  publicCode: string,
  title?: string | null,
): string {
  const code = formatEntityCode(publicCode);
  const shortTitle = title?.trim();
  if (!shortTitle) return code;
  // Títulos genéricos de cita no aportan bajo la carpeta del cliente
  if (/^visita\s+t[eé]cnica/i.test(shortTitle)) return code;
  const clipped =
    shortTitle.length > 60 ? `${shortTitle.slice(0, 57)}…` : shortTitle;
  return `${code} - ${clipped}`;
}

export async function ensureClientDriveFolder(
  clientId: string,
): Promise<Client> {
  let client = await db.getClientById(clientId);
  if (!client) {
    throw new Error("Client not found");
  }

  // Código permanente antes de nombrar la carpeta; no reasignar si ya es C-xx
  if (!client.leadCode || client.leadCode.startsWith("TMP-")) {
    client = await db.promoteTemporaryLeadCode(clientId);
  }

  if (client.driveFolderId && client.driveFolderUrl) {
    return client;
  }

  if (!isGoogleConfigured()) {
    return client;
  }

  const folder = await createFolder({
    name: clientFolderName(client),
  });

  return db.updateClient(clientId, {
    driveFolderId: folder.folderId,
    driveFolderUrl: folder.folderUrl,
  });
}

export async function ensureProjectDriveFolder(projectId: string) {
  const project = await db.getProjectById(projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  if (project.driveFolderId && project.driveFolderUrl) {
    return project;
  }

  if (!isGoogleConfigured()) {
    return db.updateProject(projectId, { driveSyncPending: true }).then(() =>
      db.getProjectById(projectId),
    );
  }

  try {
    const client = await ensureClientDriveFolder(project.clientId);
    if (!client.driveFolderId) {
      throw new Error("Client Drive folder missing after ensure");
    }

    const folder = await createFolder({
      name: projectChildFolderName(project.publicCode, project.title),
      parentId: client.driveFolderId,
    });

    await db.updateProject(projectId, {
      driveFolderId: folder.folderId,
      driveFolderUrl: folder.folderUrl,
      driveSyncPending: false,
    });
    return db.getProjectById(projectId);
  } catch (error) {
    console.error("Drive sync failed", error);
    await db.updateProject(projectId, { driveSyncPending: true });
    return db.getProjectById(projectId);
  }
}

export async function retryPendingDriveFolders() {
  const pending = await db.listPendingDriveProjects();
  const results = [];
  for (const project of pending) {
    results.push(await ensureProjectDriveFolder(project.id));
  }
  return results.filter(Boolean);
}

export type DriveNestResult = {
  clientId: string;
  clientCode: string;
  projectId?: string;
  publicCode?: string;
  status: "client_created" | "moved" | "renamed" | "unchanged" | "skipped" | "failed";
  detail?: string;
  error?: string;
};

/**
 * Migra carpetas planas (raíz) a Cliente → Proyecto y persiste driveFolder* del cliente.
 */
export async function nestProjectDriveFoldersUnderClients(): Promise<{
  clientsTouched: number;
  moved: number;
  renamed: number;
  unchanged: number;
  skipped: number;
  failed: number;
  results: DriveNestResult[];
}> {
  if (!isGoogleConfigured()) {
    throw new Error("Google Drive no está configurado");
  }

  const projects = await db.listProjects();
  const byClient = new Map<string, ProjectWithRelations[]>();
  for (const project of projects) {
    const list = byClient.get(project.clientId) ?? [];
    list.push(project);
    byClient.set(project.clientId, list);
  }

  const results: DriveNestResult[] = [];
  let clientsTouched = 0;
  let moved = 0;
  let renamed = 0;
  let unchanged = 0;
  let skipped = 0;
  let failed = 0;

  for (const [clientId, clientProjects] of byClient) {
    const withFolders = clientProjects.filter((p) => p.driveFolderId);
    if (withFolders.length === 0) {
      skipped += 1;
      results.push({
        clientId,
        clientCode: formatEntityCode(clientProjects[0].client.leadCode),
        status: "skipped",
        detail: "Sin carpetas de proyecto",
      });
      continue;
    }

    try {
      let client = clientProjects[0].client;
      const hadClientFolder = Boolean(client.driveFolderId);

      if (!client.driveFolderId || !client.driveFolderUrl) {
        client = await ensureClientDriveFolder(clientId);
        clientsTouched += 1;
        results.push({
          clientId,
          clientCode: formatEntityCode(client.leadCode),
          status: "client_created",
          detail: client.driveFolderId ?? undefined,
        });
      } else {
        // Asegurar nombre canónico del cliente
        const desiredClientName = clientFolderName(client);
        const currentClientName = await getDriveFolderName(client.driveFolderId);
        if (currentClientName !== desiredClientName) {
          await renameDriveFolder({
            folderId: client.driveFolderId,
            name: desiredClientName,
          });
          renamed += 1;
          results.push({
            clientId,
            clientCode: formatEntityCode(client.leadCode),
            status: "renamed",
            detail: `"${currentClientName}" → "${desiredClientName}"`,
          });
        }
        if (!hadClientFolder) clientsTouched += 1;
      }

      if (!client.driveFolderId) {
        throw new Error("Client folder id missing");
      }

      for (const project of withFolders) {
        const folderId = project.driveFolderId!;
        const desiredName = projectChildFolderName(
          project.publicCode,
          project.title,
        );

        try {
          const parents = await getDriveFolderParents(folderId);
          const alreadyNested = parents.includes(client.driveFolderId);

          if (!alreadyNested) {
            await moveDriveFolder({
              folderId,
              newParentId: client.driveFolderId,
            });
            moved += 1;
            results.push({
              clientId,
              clientCode: formatEntityCode(client.leadCode),
              projectId: project.id,
              publicCode: formatEntityCode(project.publicCode),
              status: "moved",
              detail: `→ ${formatEntityCode(client.leadCode)}`,
            });
          }

          const currentName = await getDriveFolderName(folderId);
          if (currentName !== desiredName) {
            await renameDriveFolder({ folderId, name: desiredName });
            renamed += 1;
            results.push({
              clientId,
              clientCode: formatEntityCode(client.leadCode),
              projectId: project.id,
              publicCode: formatEntityCode(project.publicCode),
              status: "renamed",
              detail: `"${currentName}" → "${desiredName}"`,
            });
          } else if (alreadyNested) {
            unchanged += 1;
            results.push({
              clientId,
              clientCode: formatEntityCode(client.leadCode),
              projectId: project.id,
              publicCode: formatEntityCode(project.publicCode),
              status: "unchanged",
            });
          }
        } catch (error) {
          failed += 1;
          results.push({
            clientId,
            clientCode: formatEntityCode(client.leadCode),
            projectId: project.id,
            publicCode: formatEntityCode(project.publicCode),
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      failed += 1;
      results.push({
        clientId,
        clientCode: formatEntityCode(clientProjects[0].client.leadCode),
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    clientsTouched,
    moved,
    renamed,
    unchanged,
    skipped,
    failed,
    results,
  };
}

export type DriveFolderRenameResult = {
  projectId: string;
  publicCode: string;
  from: string | null;
  to: string;
  status: "renamed" | "unchanged" | "skipped" | "failed";
  error?: string;
};

/** Renombra carpetas de proyecto al nombre hijo canónico (bajo el cliente). */
export async function renameProjectDriveFoldersToShortCodes(): Promise<{
  renamed: number;
  unchanged: number;
  skipped: number;
  failed: number;
  results: DriveFolderRenameResult[];
}> {
  if (!isGoogleConfigured()) {
    throw new Error("Google Drive no está configurado");
  }

  const projects = await db.listProjects();
  const results: DriveFolderRenameResult[] = [];
  let renamed = 0;
  let unchanged = 0;
  let skipped = 0;
  let failed = 0;

  for (const project of projects) {
    const publicCode = formatEntityCode(project.publicCode);
    if (!project.driveFolderId) {
      skipped += 1;
      results.push({
        projectId: project.id,
        publicCode,
        from: null,
        to: "",
        status: "skipped",
      });
      continue;
    }

    const to = projectChildFolderName(project.publicCode, project.title);

    try {
      const from = await getDriveFolderName(project.driveFolderId);
      if (from === to) {
        unchanged += 1;
        results.push({
          projectId: project.id,
          publicCode,
          from,
          to,
          status: "unchanged",
        });
        continue;
      }

      await renameDriveFolder({
        folderId: project.driveFolderId,
        name: to,
      });
      renamed += 1;
      results.push({
        projectId: project.id,
        publicCode,
        from,
        to,
        status: "renamed",
      });
    } catch (error) {
      failed += 1;
      results.push({
        projectId: project.id,
        publicCode,
        from: null,
        to,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { renamed, unchanged, skipped, failed, results };
}
