import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { recordAudit } from "@/lib/crm/audit";
import { db } from "@/lib/db";
import { canDeleteQuote } from "@/lib/crm/quote-delete";

export async function GET(
  request: Request,
  context: { params: Promise<{ quoteId: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { quoteId } = await context.params;
  const quote = await db.getQuoteById(quoteId);
  if (!quote) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const project = await db.getProjectById(quote.projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ quote, project });
}

const percentSchema = z.number().min(0).max(999);
const discountSchema = z.number().min(0).max(100);

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  status: z.enum(["DRAFT", "FINAL"]).optional(),
  commercialStatus: z
    .enum(["NONE", "SENT", "ACCEPTED", "REJECTED"])
    .optional(),
  mermaPercent: percentSchema.optional(),
  utilidadPercent: percentSchema.optional(),
  extraPercent: percentSchema.optional(),
  discountPercent: discountSchema.optional(),
  includeIva: z.boolean().optional(),
  warrantyMonths: z.number().int().min(0).max(120).optional(),
  installmentCount: z.number().int().min(0).max(60).optional(),
  installmentInterestFree: z.boolean().optional(),
  observations: z.string().max(4000).optional(),
  showObservations: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ quoteId: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { quoteId } = await context.params;
  const existing = await db.getQuoteById(quoteId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const quote = await db.updateQuote(quoteId, parsed.data);
  return NextResponse.json({ quote });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ quoteId: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { quoteId } = await context.params;
  const existing = await db.getQuoteById(quoteId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!canDeleteQuote(existing.createdAt)) {
    return NextResponse.json(
      {
        error:
          "Solo se puede eliminar una cotización durante las primeras 48 horas",
      },
      { status: 403 },
    );
  }

  await db.deleteQuote(quoteId);
  await recordAudit({
    action: "QUOTE_DELETE",
    actorEmail: session.email,
    target: quoteId,
    detail: existing.quoteCode ?? existing.title,
  });
  return NextResponse.json({ ok: true });
}
