import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { db } from "@/lib/db";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  categoryId: z.string().min(1).nullable().optional(),
  unit: z.enum(["ML", "M2", "M3", "UD", "D"]).optional(),
  costPrice: z.number().finite().nonnegative().optional(),
});

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

  try {
    const material = await db.updateMaterial(id, parsed.data);
    return NextResponse.json({ material });
  } catch {
    return NextResponse.json({ error: "Material no encontrado" }, { status: 404 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  await db.deleteMaterial(id);
  return NextResponse.json({ ok: true });
}
