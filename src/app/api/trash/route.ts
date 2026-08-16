import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth/api-session";
import { recordAudit } from "@/lib/crm/audit";
import {
  getTrashContents,
  purgeAllTrash,
  purgeClient,
  purgeExpiredTrash,
  purgeProject,
  restoreAllTrash,
  restoreClient,
  restoreProject,
} from "@/lib/crm/trash";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("restore"),
    kind: z.enum(["client", "project"]),
    id: z.string().min(1),
  }),
  z.object({
    action: z.literal("purge"),
    kind: z.enum(["client", "project"]),
    id: z.string().min(1),
  }),
  z.object({ action: z.literal("restore-all") }),
  z.object({ action: z.literal("purge-all") }),
]);

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  await purgeExpiredTrash();
  const trash = await getTrashContents();
  return NextResponse.json({ trash });
}

export async function POST(request: Request) {
  // Las acciones masivas y el borrado definitivo son irreversibles: solo ADMIN.
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = actionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const body = parsed.data;
  const actorEmail = auth.session.email;
  const needsAdmin =
    body.action === "purge" ||
    body.action === "purge-all" ||
    body.action === "restore-all";

  if (needsAdmin && auth.session.role !== "ADMIN") {
    return NextResponse.json(
      {
        error:
          "Esta acción requiere permisos de administrador. Pide que agreguen tu correo a ADMIN_EMAILS.",
      },
      { status: 403 },
    );
  }

  try {
    if (body.action === "restore-all") {
      const result = await restoreAllTrash();
      await recordAudit({
        action: "TRASH_RESTORE_ALL",
        actorEmail,
        detail: `${result.clients} clientes y ${result.projects} proyectos restaurados`,
      });
      return NextResponse.json({ ok: true, result });
    }
    if (body.action === "purge-all") {
      const result = await purgeAllTrash();
      await recordAudit({
        action: "TRASH_PURGE_ALL",
        actorEmail,
        detail: `${result.clients} clientes y ${result.projects} proyectos borrados definitivamente`,
      });
      return NextResponse.json({ ok: true, result });
    }
    if (body.action === "restore") {
      if (body.kind === "client") await restoreClient(body.id);
      else await restoreProject(body.id);
      await recordAudit({
        action: "TRASH_RESTORE",
        actorEmail,
        target: body.id,
        detail: `Restaurado ${body.kind}`,
      });
      return NextResponse.json({ ok: true });
    }
    if (body.kind === "client") await purgeClient(body.id);
    else await purgeProject(body.id);
    await recordAudit({
      action: "TRASH_PURGE",
      actorEmail,
      target: body.id,
      detail: `Borrado definitivo de ${body.kind}`,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/trash failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo completar la acción",
      },
      { status: 500 },
    );
  }
}
