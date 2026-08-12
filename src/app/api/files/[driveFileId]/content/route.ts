import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { downloadDriveFile } from "@/lib/google/drive";
import { isGoogleConfigured } from "@/lib/google/auth";

export async function GET(
  request: Request,
  context: { params: Promise<{ driveFileId: string }> },
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

  const { driveFileId } = await context.params;

  try {
    const file = await downloadDriveFile(driveFileId);
    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(file.fileName)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo leer el archivo";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
