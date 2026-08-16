import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  normalizeMaterialUnit,
  parseCostPrice,
  parseCsv,
} from "@/lib/crm/materials-csv";

const rowSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(120),
  unit: z.string().trim().min(1),
  costPrice: z.string().trim().min(1),
});

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { csv?: string };
  if (!body.csv || typeof body.csv !== "string") {
    return NextResponse.json({ error: "CSV vacío" }, { status: 400 });
  }
  if (body.csv.length > 2_000_000) {
    return NextResponse.json(
      { error: "El CSV es demasiado grande (máximo 2 MB)" },
      { status: 413 },
    );
  }

  const rows = parseCsv(body.csv);
  if (rows.length < 2) {
    return NextResponse.json(
      { error: "El CSV debe incluir encabezado y al menos una fila" },
      { status: 400 },
    );
  }

  const header = rows[0].map((h) => h.toLowerCase());
  const nameIdx = header.findIndex((h) =>
    ["nombre", "material", "name", "descripcion", "descripción"].includes(h),
  );
  const categoryIdx = header.findIndex((h) =>
    ["categoria", "categoría", "category"].includes(h),
  );
  const unitIdx = header.findIndex((h) =>
    ["unidad", "unit", "unidad de medida"].includes(h),
  );
  const costIdx = header.findIndex((h) =>
    ["costo", "precio", "precio unitario", "costprice", "cost_price"].includes(
      h,
    ),
  );

  if (nameIdx < 0 || categoryIdx < 0 || unitIdx < 0 || costIdx < 0) {
    return NextResponse.json(
      {
        error:
          "Encabezados requeridos: nombre, categoria, unidad, costo (o precio)",
      },
      { status: 400 },
    );
  }

  const categories = await db.listMaterialCategories();
  const categoryByName = new Map(
    categories.map((c) => [c.name.trim().toLowerCase(), c]),
  );

  const errors: string[] = [];
  const toCreate: Array<{
    name: string;
    categoryId: string;
    unit: "ML" | "M2" | "M3" | "UD" | "D";
    costPrice: number;
  }> = [];

  for (let i = 1; i < rows.length; i += 1) {
    const raw = rows[i];
    const parsed = rowSchema.safeParse({
      name: raw[nameIdx] ?? "",
      category: raw[categoryIdx] ?? "",
      unit: raw[unitIdx] ?? "",
      costPrice: raw[costIdx] ?? "",
    });
    if (!parsed.success) {
      errors.push(`Fila ${i + 1}: datos incompletos`);
      continue;
    }

    const unit = normalizeMaterialUnit(parsed.data.unit);
    const costPrice = parseCostPrice(parsed.data.costPrice);
    const category = categoryByName.get(
      parsed.data.category.trim().toLowerCase(),
    );

    if (!unit) {
      errors.push(`Fila ${i + 1}: unidad inválida (${parsed.data.unit})`);
      continue;
    }
    if (costPrice == null) {
      errors.push(`Fila ${i + 1}: costo inválido (${parsed.data.costPrice})`);
      continue;
    }
    if (!category) {
      // create missing category on the fly
      const created = await db.createMaterialCategory({
        name: parsed.data.category.trim(),
      });
      categoryByName.set(created.name.trim().toLowerCase(), created);
      toCreate.push({
        name: parsed.data.name,
        categoryId: created.id,
        unit,
        costPrice,
      });
      continue;
    }

    toCreate.push({
      name: parsed.data.name,
      categoryId: category.id,
      unit,
      costPrice,
    });
  }

  if (toCreate.length === 0) {
    return NextResponse.json(
      { error: "No se importó ningún material", errors },
      { status: 400 },
    );
  }

  // Firestore batch limit is 500
  const created = [];
  for (let i = 0; i < toCreate.length; i += 400) {
    const chunk = toCreate.slice(i, i + 400);
    created.push(...(await db.createMaterials(chunk)));
  }

  return NextResponse.json({
    created: created.length,
    errors,
    materials: created,
  });
}
