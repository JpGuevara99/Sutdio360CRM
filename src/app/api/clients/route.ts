import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { createClient } from "@/lib/crm/create-project";
import { db } from "@/lib/db";

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional().default(""),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
});

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clients = await db.listClients();
  return NextResponse.json({ clients });
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
    const client = await createClient({
      firstName: data.firstName,
      lastName: data.lastName ?? "",
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
    });
    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    console.error("POST /api/clients failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "No se pudo crear el cliente",
      },
      { status: 500 },
    );
  }
}
