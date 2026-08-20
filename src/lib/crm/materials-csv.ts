import type { MaterialUnit } from "@/lib/crm/types";
import { MATERIAL_UNIT_LABELS, MATERIAL_UNITS, parseDecimalNumber } from "@/lib/crm/labels";

export function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n") {
      row.push(cell.trim());
      if (row.some((v) => v.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some((v) => v.length > 0)) rows.push(row);
  return rows;
}

export function normalizeMaterialUnit(raw: string): MaterialUnit | null {
  const value = raw.trim().toLowerCase();
  const aliases: Record<string, MaterialUnit> = {
    ml: "ML",
    "metro lineal": "ML",
    "metro lineal (ml)": "ML",
    m2: "M2",
    "m²": "M2",
    "metro cuadrado": "M2",
    "metro cuadrado (m2)": "M2",
    "metro cuadrado (m²)": "M2",
    m3: "M3",
    "m³": "M3",
    "metro cubico": "M3",
    "metro cúbico": "M3",
    "metro cúbico (m3)": "M3",
    "metro cúbico (m³)": "M3",
    ud: "UD",
    u: "UD",
    unidad: "UD",
    "unidad (ud)": "UD",
    d: "D",
    dia: "D",
    dias: "D",
    día: "D",
    días: "D",
    "dias (d)": "D",
    "días (d)": "D",
  };

  if (aliases[value]) return aliases[value];
  const upper = raw.trim().toUpperCase();
  return (MATERIAL_UNITS as string[]).includes(upper)
    ? (upper as MaterialUnit)
    : null;
}

export function unitLabel(unit: MaterialUnit): string {
  return MATERIAL_UNIT_LABELS[unit];
}

export function parseCostPrice(raw: string): number | null {
  if (!raw.trim()) return null;
  return parseDecimalNumber(raw, 2);
}
