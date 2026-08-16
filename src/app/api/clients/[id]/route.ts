import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { requireApiSession } from "@/lib/auth/api-session";
import { recordAudit } from "@/lib/crm/audit";
import { trashClient } from "@/lib/crm/trash";
import { db } from "@/lib/db";

const updateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
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
  const client = await db.getClientWithProjects(id);
  if (!client) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ client });
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
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const client = await db.updateClient(id, {
    firstName: data.firstName,
    lastName: data.lastName,
    email:
      data.email === undefined
        ? undefined
        : data.email === "" || data.email === null
          ? null
          : data.email,
    phone:
      data.phone === undefined
        ? undefined
        : data.phone === "" || data.phone === null
          ? null
          : data.phone,
    address:
      data.address === undefined
        ? undefined
        : data.address === "" || data.address === null
          ? null
          : data.address,
  });

  return NextResponse.json({ client });
}

/** Envía el cliente y todos sus proyectos a la papelera de reciclaje. */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  // Eliminar un cliente arrastra todos sus proyectos a la papelera.
  const auth = await requireApiSession(request, { admin: true });
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  try {
    await trashClient(id);
    await recordAudit({
      action: "CLIENT_TRASH",
      actorEmail: auth.session.email,
      target: id,
      detail: "Cliente y sus proyectos enviados a la papelera",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/clients/[id] failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo eliminar el cliente",
      },
      { status: 500 },
    );
  }
}
