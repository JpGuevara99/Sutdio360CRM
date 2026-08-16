import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { closeProject } from "@/lib/crm/close-project";

const bodySchema = z.object({
  outcome: z.enum(["APROBADO", "RECHAZADO"]),
  quoteId: z.string().min(1).nullable().optional(),
  amount: z.number().min(0).nullable().optional(),
  /** Fecha de finalización (YYYY-MM-DD o ISO) */
  closedAt: z.string().min(4).optional(),
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

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  let closedAt: Date | null = null;
  if (parsed.data.closedAt) {
    const raw = parsed.data.closedAt;
    // Un YYYY-MM-DD se interpreta al mediodía para evitar saltos de zona.
    const value = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? new Date(`${raw}T12:00:00.000Z`)
      : new Date(raw);
    if (Number.isNaN(value.getTime())) {
      return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
    }
    closedAt = value;
  }

  try {
    const project = await closeProject({
      projectId: id,
      outcome: parsed.data.outcome,
      quoteId: parsed.data.quoteId ?? null,
      amount: parsed.data.amount ?? null,
      closedAt,
    });
    return NextResponse.json({ project });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo cerrar el proyecto";
    const status = message.includes("no encontrado")
      ? 404
      : message.includes("no pertenece")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
