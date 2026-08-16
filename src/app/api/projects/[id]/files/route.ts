import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { MAX_UPLOAD_BYTES, isBlockedUpload } from "@/lib/crm/file-safety";
import { db } from "@/lib/db";
import { ensureProjectDriveFolder } from "@/lib/crm/drive-sync";
import { uploadFileToFolder } from "@/lib/google/drive";
import { formatGoogleAuthError, isGoogleConfigured } from "@/lib/google/auth";
import type { FileKind } from "@/lib/crm/types";

function kindFromMime(mimeType: string, fileName: string): FileKind {
  if (mimeType.startsWith("image/")) return "PHOTO";
  if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
    return "QUOTE_PDF";
  }
  if (/\.(dwg|dxf|png|jpg|jpeg)$/i.test(fileName)) {
    return fileName.toLowerCase().match(/\.(png|jpg|jpeg)$/) ? "PHOTO" : "SKETCH";
  }
  return "OTHER";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const project = await db.getProjectById(id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ files: project.files ?? [] });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isGoogleConfigured()) {
    return NextResponse.json(
      { error: "Google Drive no está configurado" },
      { status: 503 },
    );
  }

  const { id } = await context.params;
  let project = await db.getProjectById(id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!project.driveFolderId) {
    try {
      await ensureProjectDriveFolder(id);
    } catch (error) {
      return NextResponse.json(
        { error: formatGoogleAuthError(error) },
        { status: 502 },
      );
    }
    project = await db.getProjectById(id);
    if (!project?.driveFolderId) {
      return NextResponse.json(
        { error: "No hay carpeta Drive para este proyecto" },
        { status: 400 },
      );
    }
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `El archivo supera el máximo de ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB`,
      },
      { status: 413 },
    );
  }

  const mimeType = file.type || "application/octet-stream";
  if (isBlockedUpload(file.name, mimeType)) {
    return NextResponse.json(
      {
        error:
          "Ese tipo de archivo no se permite (puede ejecutar código). Súbelo como PDF o imagen.",
      },
      { status: 415 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const uploaded = await uploadFileToFolder({
    folderId: project.driveFolderId,
    fileName: file.name,
    mimeType,
    buffer,
  });

  const fileRef = await db.createFileRef({
    projectId: id,
    driveFileId: uploaded.fileId,
    kind: kindFromMime(uploaded.mimeType, file.name),
    name: file.name,
    mimeType: uploaded.mimeType,
    webViewLink: uploaded.webViewLink,
  });

  return NextResponse.json({ file: fileRef }, { status: 201 });
}
