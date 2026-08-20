import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { isLaborCategory } from "@/lib/crm/quote-summary";
import { db } from "@/lib/db";

const patchSchema = z
  .object({
    quantity: z.number().min(0).max(1_000_000).optional(),
    unitCost: z.number().min(0).max(1_000_000_000).optional(),
    unit: z.enum(["ML", "M2", "M3", "UD", "D"]).optional(),
  })
  .refine(
    (data) =>
      data.quantity !== undefined ||
      data.unitCost !== undefined ||
      data.unit !== undefined,
    { message: "Nada que actualizar" },
  );

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
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  if (
    (parsed.data.unitCost !== undefined || parsed.data.unit !== undefined) &&
    !isLaborCategory(line.categoryName)
  ) {
    return NextResponse.json(
      {
        error:
          "El costo y la unidad solo se pueden editar en ítems de Mano de Obra",
      },
      { status: 400 },
    );
  }

  const updated = await db.updateQuoteLine(lineId, parsed.data);
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
