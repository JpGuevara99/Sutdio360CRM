"use client";

import {
  MATERIAL_UNIT_LABELS,
  MATERIAL_UNITS,
} from "@/lib/crm/labels";
import type { MaterialCategory, MaterialUnit } from "@/lib/crm/types";

export type MaterialFormState = {
  name: string;
  categoryId: string;
  unit: MaterialUnit;
  costPrice: string;
};

export function emptyMaterialForm(
  categories: Pick<MaterialCategory, "id">[],
): MaterialFormState {
  return {
    name: "",
    categoryId: categories[0]?.id ?? "",
    unit: "UD",
    costPrice: "",
  };
}

export function MaterialFormFields({
  form,
  categories,
  onChange,
}: {
  form: MaterialFormState;
  categories: Pick<MaterialCategory, "id" | "name">[];
  onChange: (form: MaterialFormState) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block text-muted">Nombre del material</span>
        <input
          required
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          placeholder="Ej. Perfil aluminio 20x40"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-primary"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-muted">Categoría</span>
        <select
          required
          value={form.categoryId}
          onChange={(e) => onChange({ ...form, categoryId: e.target.value })}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-primary"
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-muted">Unidad de medida</span>
        <select
          value={form.unit}
          onChange={(e) =>
            onChange({ ...form, unit: e.target.value as MaterialUnit })
          }
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-primary"
        >
          {MATERIAL_UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {MATERIAL_UNIT_LABELS[unit]}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block text-muted">Precio de costo</span>
        <input
          required
          inputMode="decimal"
          value={form.costPrice}
          onChange={(e) => onChange({ ...form, costPrice: e.target.value })}
          placeholder="0"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-primary"
        />
      </label>
    </div>
  );
}
