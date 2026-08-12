import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { db } from "@/lib/db";

const patchSchema = z.object({
  quantity: z.number().min(0).max(1_000_000),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ quoteId: string; lineId: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { quoteId, lineId } = await context.params;
  const line = await db.getQuoteLineById(lineId);
  if (!line || line.quoteId !== quoteId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Cantidad inválida" }, { status: 400 });
  }

  const updated = await db.updateQuoteLine(lineId, {
    quantity: parsed.data.quantity,
  });
  return NextResponse.json({ line: updated });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ quoteId: string; lineId: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { quoteId, lineId } = await context.params;
  const line = await db.getQuoteLineById(lineId);
  if (!line || line.quoteId !== quoteId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.deleteQuoteLine(lineId);
  return NextResponse.json({ ok: true });
}
