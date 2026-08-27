"use client";

import { useState } from "react";
import {
  MaterialFormFields,
  emptyMaterialForm,
  type MaterialFormState,
} from "@/components/crm/MaterialFormFields";
import {
  formatDecimalInput,
  parseDecimalNumber,
} from "@/lib/crm/labels";
import type { Material, MaterialCategory } from "@/lib/crm/types";

export function MaterialQuickEditorModal({
  material,
  categories,
  onClose,
  onSaved,
}: {
  material?: Material | null;
  categories: MaterialCategory[];
  onClose: () => void;
  onSaved: (material: Material) => void;
}) {
  const isEdit = Boolean(material);
  const [form, setForm] = useState<MaterialFormState>(() =>
    material
      ? {
          name: material.name,
          categoryId: material.categoryId ?? categories[0]?.id ?? "",
          unit: material.unit,
          costPrice: formatDecimalInput(material.costPrice, 2),
        }
      : emptyMaterialForm(categories),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    const costPrice = parseDecimalNumber(form.costPrice, 2);
    if (!form.name.trim()) {
      setError("Ingresa el nombre del material");
      return;
    }
    if (!form.categoryId) {
      setError("Selecciona una categoría");
      return;
    }
    if (costPrice == null || costPrice < 0) {
      setError("Ingresa un precio de costo válido");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        categoryId: form.categoryId,
        unit: form.unit,
        costPrice,
      };
      const res = await fetch(
        isEdit && material ? `/api/materials/${material.id}` : "/api/materials",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json()) as {
        material?: Material;
        error?: string;
      };
      if (!res.ok || !data.material) {
        setError(data.error ?? "No se pudo guardar el material");
        return;
      }
      onSaved({
        ...data.material,
        createdAt: new Date(data.material.createdAt),
        updatedAt: new Date(data.material.updatedAt),
      });
      onClose();
    } catch {
      setError("Error de red al guardar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/35"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-xl"
      >
        <h3 className="text-base font-semibold text-foreground">
          {isEdit ? "Editar material" : "Nuevo material"}
        </h3>
        <p className="mt-1 text-xs text-muted">
          {isEdit
            ? "Los cambios se guardan en el catálogo y quedan disponibles al instante."
            : "Se agrega al catálogo y vuelves a la lista de selección."}
        </p>

        <div className="mt-4">
          <MaterialFormFields
            form={form}
            categories={categories}
            onChange={setForm}
          />
        </div>

        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-border px-4 py-2 text-sm text-muted-strong hover:bg-hover disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc] disabled:opacity-60"
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
