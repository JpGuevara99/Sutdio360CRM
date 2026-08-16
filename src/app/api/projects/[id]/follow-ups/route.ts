import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { runFollowUpAction } from "@/lib/crm/follow-up-engine";

const bodySchema = z.object({
  action: z.enum(["start", "advance", "cancel", "reset"]).default("advance"),
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
  let json: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) json = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  }

  try {
    const result = await runFollowUpAction(parsed.data.action, id);
    return NextResponse.json({
      project: result.project,
      settings: result.settings,
      scheduledNumber: result.scheduledNumber,
      scheduledAt: result.scheduledAt?.toISOString() ?? null,
      taskId: result.taskId,
      taskError: result.taskError,
      warning: result.warning,
      message: result.message,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo actualizar el seguimiento";
    const status = message.includes("no encontrado")
      ? 404
      : message.includes("detenidos")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
