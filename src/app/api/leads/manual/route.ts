import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { createManualLead } from "@/lib/crm/create-manual-lead";
import type { VisitSource } from "@/lib/crm/types";

const schema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  scheduledAt: z.string().datetime(),
  durationMin: z.number().int().positive().optional(),
  source: z.enum([
    "APPOINTMENT_SCHEDULE",
    "WHATSAPP",
    "INSTAGRAM",
    "PHONE",
    "MANUAL",
  ]),
  notes: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const project = await createManualLead({
    ...parsed.data,
    source: parsed.data.source as VisitSource,
    scheduledAt: new Date(parsed.data.scheduledAt),
  });

  return NextResponse.json({ project }, { status: 201 });
}
