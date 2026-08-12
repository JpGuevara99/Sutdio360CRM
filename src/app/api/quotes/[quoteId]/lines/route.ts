import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { db } from "@/lib/db";

const bulkSchema = z.object({
  materialIds: z.array(z.string().min(1)).min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ quoteId: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { quoteId } = await context.params;
  const quote = await db.getQuoteById(quoteId);
  if (!quote) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = bulkSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Selecciona al menos un material" },
      { status: 400 },
    );
  }

  const [materials, categories] = await Promise.all([
    db.listMaterials(),
    db.listMaterialCategories(),
  ]);
  const byId = new Map(materials.map((m) => [m.id, m]));
  const catById = new Map(categories.map((c) => [c.id, c]));

  const payload = [];
  for (const materialId of parsed.data.materialIds) {
    const material = byId.get(materialId);
    if (!material) continue;
    const category = material.categoryId
      ? catById.get(material.categoryId)
      : null;
    payload.push({
      materialId: material.id,
      name: material.name,
      categoryId: material.categoryId,
      categoryName: category?.name ?? "Sin categoría",
      unit: material.unit,
      unitCost: material.costPrice,
      quantity: 1,
    });
  }

  if (payload.length === 0) {
    return NextResponse.json(
      { error: "No se encontraron materiales válidos" },
      { status: 400 },
    );
  }

  const lines = await db.addQuoteLines({ quoteId, materials: payload });
  const refreshed = await db.getQuoteById(quoteId);
  return NextResponse.json({ lines, quote: refreshed }, { status: 201 });
}
