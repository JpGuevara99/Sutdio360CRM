import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth/api-session";
import { recordAudit } from "@/lib/crm/audit";
import {
  mergeClients,
  previewClientMerge,
} from "@/lib/crm/merge-clients";

const previewSchema = z.object({
  clientIds: z.array(z.string().min(1)).min(2).max(20),
});

const mergeSchema = z.object({
  keeperId: z.string().min(1),
  mergeIds: z.array(z.string().min(1)).min(1).max(19),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const previewOnly = body?.preview === true;

  // Combinar es irreversible (mueve carpetas de Drive y absorbe clientes).
  const auth = await requireApiSession(request, { admin: !previewOnly });
  if (!auth.ok) return auth.response;

  if (previewOnly) {
    const parsed = previewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Selecciona al menos 2 clientes" },
        { status: 400 },
      );
    }
    try {
      const preview = await previewClientMerge(parsed.data.clientIds);
      return NextResponse.json({ preview });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo preparar la vista previa";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const parsed = mergeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  try {
    const client = await mergeClients(parsed.data);
    await recordAudit({
      action: "CLIENT_MERGE",
      actorEmail: auth.session.email,
      target: parsed.data.keeperId,
      detail: `Absorbió ${parsed.data.mergeIds.length} cliente(s): ${parsed.data.mergeIds.join(", ")}`,
    });
    return NextResponse.json({ client });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudieron combinar";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
