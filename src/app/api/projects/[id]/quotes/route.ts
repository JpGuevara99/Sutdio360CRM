import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import {
  buildQuoteCode,
  formatQuoteCodeLabel,
  nextQuoteSequence,
} from "@/lib/crm/quote-codes";
import { buildQuoteTotals, percentsFromQuote } from "@/lib/crm/quote-summary";
import { resolveQuoteCosts } from "@/lib/crm/quote-costs";
import { db } from "@/lib/db";

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

  const quotes = await db.listQuotesByProject(id);

  // ?withTotals=1 agrega el total neto de cada cotización (panel de cierre).
  const url = new URL(request.url);
  if (url.searchParams.get("withTotals") !== "1") {
    return NextResponse.json({ quotes });
  }

  const costsByQuote = await resolveQuoteCosts(quotes);
  const withTotals = quotes.map((quote) => {
    const totals = buildQuoteTotals(
      costsByQuote.get(quote.id) ?? { labor: 0, logistics: 0, materials: 0 },
      percentsFromQuote(quote),
    );
    return {
      ...quote,
      totalNeto: totals.totalNeto,
      includeIva: totals.includeIva,
      totalConIva: totals.totalConIva,
    };
  });

  return NextResponse.json({ quotes: withTotals });
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});

export async function POST(
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

  let titleOverride: string | undefined;
  try {
    const json = (await request.json()) as unknown;
    const parsed = createSchema.safeParse(json ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    titleOverride = parsed.data.title;
  } catch {
    /* body vacío ok */
  }

  const existing = await db.listQuotesByProject(id);
  const sequence = nextQuoteSequence(
    existing.map((q) => q.quoteCode),
    project.publicCode,
  );
  const quoteCode = buildQuoteCode(project.publicCode, sequence);
  const title = titleOverride?.trim() || formatQuoteCodeLabel(quoteCode);

  const quote = await db.createQuote({
    projectId: id,
    title,
    quoteCode,
  });
  return NextResponse.json({ quote }, { status: 201 });
}
