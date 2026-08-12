import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { db } from "@/lib/db";

const materialSchema = z.object({
  name: z.string().trim().min(1).max(120),
  categoryId: z.string().min(1).nullable().optional(),
  unit: z.enum(["ML", "M2", "M3", "UD", "D"]),
  costPrice: z.number().finite().nonnegative(),
});

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const materials = await db.listMaterials();
  return NextResponse.json({ materials });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = materialSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const material = await db.createMaterial(parsed.data);
  return NextResponse.json({ material }, { status: 201 });
}
