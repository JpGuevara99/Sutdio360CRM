import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth/api-session";
import { recordAudit } from "@/lib/crm/audit";
import { resolveClientMatchReview } from "@/lib/crm/client-match";

const bodySchema = z.object({
  action: z.enum(["merge", "independent"]),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  }

  const auth = await requireApiSession(request, {
    admin: parsed.data.action === "merge",
  });
  if (!auth.ok) return auth.response;

  try {
    const review = await resolveClientMatchReview(id, parsed.data.action);
    if (parsed.data.action === "merge") {
      await recordAudit({
        action: "CLIENT_MERGE",
        actorEmail: auth.session.email,
        target: review.existingClientId,
        detail: `Combinó coincidencia ${id}: ${review.newClientId} con ${review.existingClientId}`,
      });
    }
    return NextResponse.json({ review });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo resolver";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
