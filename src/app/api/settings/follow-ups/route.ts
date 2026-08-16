import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { requireApiSession } from "@/lib/auth/api-session";
import { recordAudit } from "@/lib/crm/audit";
import { FOLLOW_UP_LIMIT, FOLLOW_UP_MAX_DAYS } from "@/lib/crm/follow-ups";
import { db } from "@/lib/db";

const bodySchema = z.object({
  count: z.number().int().min(1).max(FOLLOW_UP_LIMIT),
  intervalDays: z
    .array(z.number().int().min(1).max(FOLLOW_UP_MAX_DAYS))
    .min(1)
    .max(FOLLOW_UP_LIMIT),
});

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const settings = await db.getFollowUpSettings();
  return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
  const auth = await requireApiSession(request, { admin: true });
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Revisa la cantidad de seguimientos y los días de espera" },
      { status: 400 },
    );
  }

  if (parsed.data.intervalDays.length < parsed.data.count) {
    return NextResponse.json(
      { error: "Falta configurar los días de algún seguimiento" },
      { status: 400 },
    );
  }

  const settings = await db.updateFollowUpSettings({
    count: parsed.data.count,
    intervalDays: parsed.data.intervalDays,
  });
  await recordAudit({
    action: "SETTINGS_UPDATE",
    actorEmail: auth.session.email,
    target: "followUps",
    detail: `${settings.count} seguimientos cada ${settings.intervalDays.join("/")} días`,
  });
  return NextResponse.json({ settings });
}
