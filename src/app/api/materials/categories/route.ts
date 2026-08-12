import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { db } from "@/lib/db";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const categories = await db.listMaterialCategories();
  return NextResponse.json({ categories });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Nombre de categoría inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const category = await db.createMaterialCategory({ name: parsed.data.name });
  return NextResponse.json({ category }, { status: 201 });
}
