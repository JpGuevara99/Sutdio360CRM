import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ensureProjectDriveFolder } from "@/lib/crm/drive-sync";
import { buildQuotePdfBuffer } from "@/lib/crm/quote-pdf";
import { parseQuoteVariant } from "@/lib/crm/quote-priced-lines";
import { formatEntityCode } from "@/lib/crm/project-codes";
import { isGoogleConfigured } from "@/lib/google/auth";
import { uploadFileToFolder } from "@/lib/google/drive";
import { formatInTimeZone } from "date-fns-tz";

const TZ = "America/Santiago";

const bodySchema = z.object({
  variant: z.enum(["simple", "detailed"]).optional(),
  includePdf: z.boolean().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ quoteId: string }> },
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

  const { quoteId } = await context.params;
  const rawBody = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const variant = parseQuoteVariant(parsed.data.variant);
  const includePdf = Boolean(parsed.data.includePdf);

  const quote = await db.getQuoteById(quoteId);
  if (!quote) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let project = await db.getProjectById(quote.projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!project.driveFolderId) {
    await ensureProjectDriveFolder(project.id);
    project = await db.getProjectById(project.id);
    if (!project?.driveFolderId) {
      return NextResponse.json(
        { error: "No hay carpeta Drive para este proyecto" },
        { status: 400 },
      );
    }
  }

  const company = await db.getCompanySettings();
  const buffer = await buildQuotePdfBuffer({
    quote,
    project,
    client: project.client,
    companySettings: {
      commercialAddress: company.commercialAddress,
      phone: company.phone,
    },
    variant,
  });

  const stamp = formatInTimeZone(new Date(), TZ, "yyyyMMdd-HHmm");
  const suffix = variant === "detailed" ? "detallado" : "sin-detalles";
  const fileName = `Presupuesto-${formatEntityCode(project.publicCode)}-${suffix}-${stamp}.pdf`;

  const uploaded = await uploadFileToFolder({
    folderId: project.driveFolderId,
    fileName,
    mimeType: "application/pdf",
    buffer,
  });

  const fileRef = await db.createFileRef({
    projectId: project.id,
    driveFileId: uploaded.fileId,
    kind: "QUOTE_PDF",
    name: fileName,
    mimeType: uploaded.mimeType,
    webViewLink: uploaded.webViewLink,
  });

  await db.updateQuote(quoteId, { status: "FINAL" });

  return NextResponse.json(
    {
      file: fileRef,
      fileName,
      ...(includePdf
        ? { pdfBase64: Buffer.from(buffer).toString("base64") }
        : {}),
    },
    { status: 201 },
  );
}
