import type { MaterialCategory } from "@/lib/crm/types";

export const DEFAULT_MATERIAL_CATEGORIES = [
  "Mano de Obra",
  "Logística",
  "Protección de Superficies",
  "Techo de Policarbonato",
  "Techo Cerrado",
  "Pilares de Madera",
  "Vigas de Madera",
  "Listones de Madera",
  "Molduras exteriores de Madera",
  "Canaleta",
  "Pinturas y Lija",
  "Electricidad",
  "Pernos, Tornillería, Electrodos",
  "Pilares de Fierro",
  "Vigas Rectangulares de Fierro",
  "Vigas Canal de Fierro",
  "Radier y Bases",
  "Porcelanato",
  "Quincho",
  "Extras",
] as const;

export function sortMaterialCategories(
  categories: MaterialCategory[],
): MaterialCategory[] {
  return [...categories].sort((a, b) => a.order - b.order);
}

export function normalizeCategoryName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export const DUPLICATE_CATEGORY_NAME_ERROR =
  "Ya existe una categoría con ese nombre";

export function isDuplicateCategoryName(
  name: string,
  categories: Array<{ id: string; name: string }>,
  excludeId?: string,
): boolean {
  const normalized = normalizeCategoryName(name);
  if (!normalized) return false;
  return categories.some(
    (category) =>
      category.id !== excludeId &&
      normalizeCategoryName(category.name) === normalized,
  );
}
