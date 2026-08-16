import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/api-session";
import { canRenderInline, safeHeaderFileName } from "@/lib/crm/file-safety";
import { db } from "@/lib/db";
import { downloadDriveFile } from "@/lib/google/drive";
import { isGoogleConfigured } from "@/lib/google/auth";

export async function GET(
  request: Request,
  context: { params: Promise<{ driveFileId: string }> },
) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  if (!isGoogleConfigured()) {
    return NextResponse.json(
      { error: "Google Drive no está configurado" },
      { status: 503 },
    );
  }

  const { driveFileId } = await context.params;

  // La cuenta de servicio ve todo el Drive del usuario que suplanta, así que
  // solo servimos archivos que el propio CRM registró en un proyecto.
  const fileRef = await db.getFileRefByDriveFileId(driveFileId);
  if (!fileRef) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const file = await downloadDriveFile(driveFileId);
    const fileName = safeHeaderFileName(fileRef.name || file.fileName);
    const inline = canRenderInline(file.mimeType);

    const headers: Record<string, string> = {
      "Content-Type": file.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    };

    // Lo que no se puede mostrar sin riesgo se descarga y, además, se aísla por
    // si el navegador intentara abrirlo como documento.
    if (!inline) {
      headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
    }

    return new NextResponse(new Uint8Array(file.buffer), { headers });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo leer el archivo";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
