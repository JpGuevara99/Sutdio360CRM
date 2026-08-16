import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { requireApiSession } from "@/lib/auth/api-session";
import { recordAudit } from "@/lib/crm/audit";
import { trashProject } from "@/lib/crm/trash";
import { db } from "@/lib/db";

const updateSchema = z.object({
  status: z
    .enum([
      "RESERVADO",
      "VISITADO",
      "COTIZADO",
      "SEGUIMIENTO",
      "APROBADO",
      "RECHAZADO",
      "PRODUCCION",
      "INSTALACION",
      "GARANTIA",
      "CERRADO",
    ])
    .optional(),
  title: z.string().optional().nullable(),
  stageId: z.string().min(1).nullable().optional(),
  boardOrder: z.number().optional(),
  notes: z.string().max(8000).optional().nullable(),
});

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

  return NextResponse.json({ project });
}

export async function PATCH(
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

  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const body = parsed.data;
  if (
    body.status === undefined &&
    body.title === undefined &&
    body.stageId === undefined &&
    body.boardOrder === undefined &&
    body.notes === undefined
  ) {
    return NextResponse.json(
      { error: "No hay campos para actualizar" },
      { status: 400 },
    );
  }

  try {
    await db.updateProject(id, body);
    const project = await db.getProjectById(id);
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ project });
  } catch (error) {
    console.error("PATCH /api/projects/[id] failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar el proyecto",
      },
      { status: 500 },
    );
  }
}

/** Envía el proyecto a la papelera de reciclaje (30 días). */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  try {
    await trashProject(id);
    await recordAudit({
      action: "PROJECT_TRASH",
      actorEmail: auth.session.email,
      target: id,
      detail: "Proyecto enviado a la papelera",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/projects/[id] failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo eliminar el proyecto",
      },
      { status: 500 },
    );
  }
}
