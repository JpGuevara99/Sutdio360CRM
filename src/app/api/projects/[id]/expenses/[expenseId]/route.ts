import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { serializeExpense } from "@/lib/crm/project-expense-metrics";
import { db } from "@/lib/db";

const updateSchema = z.object({
  amount: z.number().finite().positive().optional(),
  description: z.string().trim().max(500).optional(),
  category: z
    .enum(["MATERIALES", "MANO_OBRA", "TRANSPORTE", "SUBCONTRATOS", "OTROS"])
    .optional(),
  expenseDate: z.string().min(1).optional(),
});

function parseExpenseDate(raw: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    return new Date(`${raw.trim()}T12:00:00.000Z`);
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; expenseId: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, expenseId } = await context.params;
  const existing = await db.getProjectExpenseById(expenseId);
  if (!existing || existing.projectId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const patch: {
    amount?: number;
    description?: string;
    category?: typeof existing.category;
    expenseDate?: Date;
  } = {};
  if (parsed.data.amount !== undefined) patch.amount = parsed.data.amount;
  if (parsed.data.description !== undefined) {
    patch.description = parsed.data.description;
  }
  if (parsed.data.category !== undefined) patch.category = parsed.data.category;
  if (parsed.data.expenseDate !== undefined) {
    const expenseDate = parseExpenseDate(parsed.data.expenseDate);
    if (!expenseDate) {
      return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
    }
    patch.expenseDate = expenseDate;
  }

  const expense = await db.updateProjectExpense(expenseId, patch);
  return NextResponse.json({ expense: serializeExpense(expense) });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; expenseId: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, expenseId } = await context.params;
  const existing = await db.getProjectExpenseById(expenseId);
  if (!existing || existing.projectId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.deleteProjectExpense(expenseId);
  return NextResponse.json({ ok: true });
}
