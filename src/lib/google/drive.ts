import { Readable } from "stream";
import { google } from "googleapis";
import { getDriveRootFolderId, getGoogleAuth } from "@/lib/google/auth";

const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];

function getDriveClient() {
  const auth = getGoogleAuth(DRIVE_SCOPES);
  return google.drive({ version: "v3", auth });
}

function folderUrlFromId(folderId: string, webViewLink?: string | null) {
  return (
    webViewLink ?? `https://drive.google.com/drive/folders/${folderId}`
  );
}

export async function createFolder(options: {
  name: string;
  parentId?: string | null;
}): Promise<{ folderId: string; folderUrl: string }> {
  const drive = getDriveClient();
  const rootFolderId = getDriveRootFolderId();
  const parentId = options.parentId ?? rootFolderId ?? undefined;

  const res = await drive.files.create({
    requestBody: {
      name: options.name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });

  const folderId = res.data.id;
  if (!folderId) {
    throw new Error("Drive folder creation returned no id");
  }

  return {
    folderId,
    folderUrl: folderUrlFromId(folderId, res.data.webViewLink),
  };
}

/** @deprecated Prefer createFolder with explicit parent */
export async function createProjectFolder(options: {
  publicCode: string;
  clientName: string;
  parentId?: string | null;
}): Promise<{ folderId: string; folderUrl: string }> {
  return createFolder({
    name: `${options.publicCode} - ${options.clientName}`.trim(),
    parentId: options.parentId,
  });
}

export async function getDriveFolderName(
  folderId: string,
): Promise<string | null> {
  const drive = getDriveClient();
  const res = await drive.files.get({
    fileId: folderId,
    fields: "id, name",
    supportsAllDrives: true,
  });
  return res.data.name ?? null;
}

export async function getDriveFolderParents(
  folderId: string,
): Promise<string[]> {
  const drive = getDriveClient();
  const res = await drive.files.get({
    fileId: folderId,
    fields: "id, parents",
    supportsAllDrives: true,
  });
  return res.data.parents ?? [];
}

export async function renameDriveFolder(options: {
  folderId: string;
  name: string;
}): Promise<void> {
  const drive = getDriveClient();
  await drive.files.update({
    fileId: options.folderId,
    requestBody: { name: options.name },
    supportsAllDrives: true,
  });
}

export async function moveDriveFolder(options: {
  folderId: string;
  newParentId: string;
}): Promise<void> {
  const drive = getDriveClient();
  const parents = await getDriveFolderParents(options.folderId);
  if (parents.includes(options.newParentId)) {
    return;
  }

  await drive.files.update({
    fileId: options.folderId,
    addParents: options.newParentId,
    removeParents: parents.length > 0 ? parents.join(",") : undefined,
    fields: "id, parents",
    supportsAllDrives: true,
  });
}

export async function uploadFileToFolder(options: {
  folderId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<{
  fileId: string;
  webViewLink: string;
  mimeType: string;
}> {
  const drive = getDriveClient();
  const res = await drive.files.create({
    requestBody: {
      name: options.fileName,
      parents: [options.folderId],
    },
    media: {
      mimeType: options.mimeType,
      body: Readable.from(options.buffer),
    },
    fields: "id, webViewLink, mimeType",
    supportsAllDrives: true,
  });

  const fileId = res.data.id;
  if (!fileId) {
    throw new Error("Drive upload returned no file id");
  }

  return {
    fileId,
    webViewLink:
      res.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
    mimeType: res.data.mimeType ?? options.mimeType,
  };
}

export async function downloadDriveFile(fileId: string): Promise<{
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}> {
  const drive = getDriveClient();
  const meta = await drive.files.get({
    fileId,
    fields: "id, name, mimeType",
    supportsAllDrives: true,
  });

  const content = await drive.files.get(
    {
      fileId,
      alt: "media",
      supportsAllDrives: true,
    },
    { responseType: "arraybuffer" },
  );

  const data = content.data as ArrayBuffer;
  return {
    buffer: Buffer.from(data),
    mimeType: meta.data.mimeType ?? "application/octet-stream",
    fileName: meta.data.name ?? fileId,
  };
}
