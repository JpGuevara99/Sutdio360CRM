import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { requireApiSession } from "@/lib/auth/api-session";
import { recordAudit } from "@/lib/crm/audit";
import { db } from "@/lib/db";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  order: z.number().int().min(0).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const stage = await db.updatePipelineStage(id, parsed.data);
    return NextResponse.json({ stage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Cerrado")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Etapa no encontrada" }, { status: 404 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiSession(request, { admin: true });
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  try {
    await db.deletePipelineStage(id);
    await recordAudit({
      action: "PIPELINE_STAGE_DELETE",
      actorEmail: auth.session.email,
      target: id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo eliminar la etapa";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
