import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { createProjectForClient } from "@/lib/crm/create-project";
import { db } from "@/lib/db";
import type { ProjectStatus, VisitSource } from "@/lib/crm/types";

const createSchema = z
  .object({
    clientId: z.string().min(1).optional(),
    client: z
      .object({
        firstName: z.string().min(1),
        lastName: z.string().optional().default(""),
        email: z.string().email().optional().nullable().or(z.literal("")),
        phone: z.string().optional().nullable(),
        address: z.string().optional().nullable(),
      })
      .optional(),
    title: z.string().max(200).optional().nullable(),
    scheduledAt: z.string().datetime().optional().nullable(),
    durationMin: z.number().int().positive().optional().nullable(),
    source: z
      .enum([
        "APPOINTMENT_SCHEDULE",
        "WHATSAPP",
        "INSTAGRAM",
        "PHONE",
        "MANUAL",
      ])
      .optional()
      .nullable(),
    notes: z.string().max(8000).optional().nullable(),
  })
  .refine((data) => Boolean(data.clientId) || Boolean(data.client), {
    message: "Indica un cliente existente o los datos de uno nuevo",
  });

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as ProjectStatus | null;

  const projects = await db.listProjects({
    status: status ?? undefined,
  });

  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    const project = await createProjectForClient({
      client: data.clientId
        ? { id: data.clientId }
        : {
            firstName: data.client!.firstName,
            lastName: data.client!.lastName ?? "",
            email: data.client!.email || null,
            phone: data.client!.phone || null,
            address: data.client!.address || null,
          },
      title: data.title ?? null,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      durationMin: data.durationMin ?? null,
      source: (data.source as VisitSource | null) ?? null,
      notes: data.notes ?? null,
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo crear el proyecto",
      },
      { status: 500 },
    );
  }
}
