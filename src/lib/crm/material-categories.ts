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
