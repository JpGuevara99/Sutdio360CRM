import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { buildQuotePdfBuffer } from "@/lib/crm/quote-pdf";
import { parseQuoteVariant } from "@/lib/crm/quote-priced-lines";
import { formatEntityCode } from "@/lib/crm/project-codes";
import { formatInTimeZone } from "date-fns-tz";

const TZ = "America/Santiago";

export async function GET(
  request: Request,
  context: { params: Promise<{ quoteId: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { quoteId } = await context.params;
  const url = new URL(request.url);
  const variant = parseQuoteVariant(url.searchParams.get("variant"));

  const quote = await db.getQuoteById(quoteId);
  if (!quote) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const project = await db.getProjectById(quote.projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
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
  const fileName = quote.quoteCode
    ? `Cotizacion-${quote.quoteCode}-${suffix}-${stamp}.pdf`
    : `Presupuesto-${formatEntityCode(project.publicCode)}-${suffix}-${stamp}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
