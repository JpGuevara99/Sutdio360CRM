import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { serializeExpense } from "@/lib/crm/project-expense-metrics";
import { db } from "@/lib/db";

const createSchema = z.object({
  amount: z.number().finite().positive(),
  description: z.string().trim().max(500).optional().default(""),
  category: z.enum([
    "MATERIALES",
    "MANO_OBRA",
    "TRANSPORTE",
    "SUBCONTRATOS",
    "OTROS",
  ]),
  expenseDate: z.string().min(1),
});

function parseExpenseDate(raw: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    return new Date(`${raw.trim()}T12:00:00.000Z`);
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
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

  const expenses = await db.listProjectExpenses(id);
  return NextResponse.json({ expenses: expenses.map(serializeExpense) });
}

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
  if (project.closingOutcome !== "APROBADO" || !project.closedAt) {
    return NextResponse.json(
      { error: "Solo se registran gastos en proyectos concretados" },
      { status: 400 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const expenseDate = parseExpenseDate(parsed.data.expenseDate);
  if (!expenseDate) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }

  const expense = await db.createProjectExpense({
    projectId: id,
    amount: parsed.data.amount,
    description: parsed.data.description,
    category: parsed.data.category,
    expenseDate,
  });
  return NextResponse.json(
    { expense: serializeExpense(expense) },
    { status: 201 },
  );
}
