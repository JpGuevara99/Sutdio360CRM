import { readFileSync } from "fs";
import path from "path";
import { db } from "@/lib/db";
import type { MaterialUnit } from "@/lib/crm/types";

type SeedRow = {
  name: string;
  category: string;
  unit: MaterialUnit;
  costPrice: number;
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const file = path.join(
    process.cwd(),
    "src",
    "lib",
    "crm",
    "seed-materials.json",
  );
  const rows = JSON.parse(readFileSync(file, "utf8")) as SeedRow[];

  const [categories, existing] = await Promise.all([
    db.listMaterialCategories(),
    db.listMaterials(),
  ]);
  const byName = new Map(
    categories.map((c) => [normalize(c.name), c] as const),
  );

  const existingKeys = new Set(
    existing.map(
      (m) => `${normalize(m.name)}::${normalize(m.categoryId ?? "")}`,
    ),
  );

  // Also key by name alone to avoid obvious duplicates
  const existingNames = new Set(existing.map((m) => normalize(m.name)));

  const resolveCategoryId = async (categoryName: string) => {
    const key = normalize(categoryName);
    const found = byName.get(key);
    if (found) return found.id;
    const created = await db.createMaterialCategory({ name: categoryName });
    byName.set(normalize(created.name), created);
    return created.id;
  };

  const payload = [];
  let skipped = 0;
  for (const row of rows) {
    if (existingNames.has(normalize(row.name))) {
      skipped += 1;
      continue;
    }
    const categoryId = await resolveCategoryId(row.category);
    const key = `${normalize(row.name)}::${normalize(categoryId)}`;
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    payload.push({
      name: row.name,
      categoryId,
      unit: row.unit,
      costPrice: row.costPrice,
    });
    existingNames.add(normalize(row.name));
    existingKeys.add(key);
  }

  const created = [];
  for (let i = 0; i < payload.length; i += 400) {
    created.push(...(await db.createMaterials(payload.slice(i, i + 400))));
  }

  console.log(
    JSON.stringify(
      {
        existing: existing.length,
        imported: created.length,
        skipped,
        categories: byName.size,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
