import type { QuoteWithLines } from "@/lib/crm/types";

/** Agrupa líneas de cotización por categoría (seguro para client y server). */
export function groupQuoteLinesByCategory(lines: QuoteWithLines["lines"]) {
  const map = new Map<
    string,
    { categoryName: string; lines: QuoteWithLines["lines"]; subtotal: number }
  >();
  for (const line of lines) {
    const key = line.categoryId ?? line.categoryName;
    const current = map.get(key) ?? {
      categoryName: line.categoryName || "Sin categoría",
      lines: [],
      subtotal: 0,
    };
    current.lines.push(line);
    current.subtotal += line.quantity * line.unitCost;
    map.set(key, current);
  }
  return [...map.values()];
}
