"use client";

import { useMemo, useState } from "react";
import { MaterialQuickEditorModal } from "@/components/crm/MaterialQuickEditorModal";
import type { Material, MaterialCategory } from "@/lib/crm/types";
import { MATERIAL_UNIT_LABELS, formatClp } from "@/lib/crm/labels";

export function MaterialPickerModal({
  materials,
  categories,
  excludeIds,
  onClose,
  onAccept,
  onMaterialSaved,
}: {
  materials: Material[];
  categories: MaterialCategory[];
  excludeIds: Set<string>;
  onClose: () => void;
  onAccept: (materialIds: string[]) => Promise<void> | void;
  onMaterialSaved?: (material: Material) => void;
}) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorMaterial, setEditorMaterial] = useState<Material | null | "new">(
    null,
  );

  const catName = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string | null) =>
      (id && map.get(id)) || "Sin categoría";
  }, [categories]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return materials.filter((m) => {
      if (excludeIds.has(m.id)) return false;
      if (categoryId !== "all" && m.categoryId !== categoryId) return false;
      if (!q) return true;
      const hay = `${m.name} ${catName(m.categoryId)} ${MATERIAL_UNIT_LABELS[m.unit]} ${m.costPrice}`.toLowerCase();
      return hay.includes(q);
    });
  }, [materials, excludeIds, categoryId, query, catName]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleMaterialSaved(material: Material) {
    onMaterialSaved?.(material);
    setSelected((prev) => new Set(prev).add(material.id));
    setEditorMaterial(null);
  }

  async function accept() {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onAccept([...selected]);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron agregar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <button
          type="button"
          className="absolute inset-0 bg-black/35"
          aria-label="Cerrar"
          onClick={onClose}
        />
        <div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-surface shadow-xl">
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Añadir materiales
              </h3>
              <p className="text-xs text-muted">
                Busca, selecciona varios y acepta
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-2 text-lg text-muted hover:bg-hover"
            >
              ×
            </button>
          </div>

          <div className="flex flex-wrap gap-2 border-b border-border px-5 py-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar material…"
              className="min-w-[180px] flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="all">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setEditorMaterial("new")}
              className="rounded-full border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition hover:border-primary hover:bg-primary-soft/30"
            >
              + Nuevo material
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2">
            {filtered.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted">
                Sin resultados
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((m) => {
                  const checked = selected.has(m.id);
                  return (
                    <li key={m.id}>
                      <div className="flex items-start gap-2 px-3 py-2.5 hover:bg-surface-muted">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(m.id)}
                            className="mt-1 accent-[#1a73e8]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-foreground">
                              {m.name}
                            </span>
                            <span className="block text-xs text-muted">
                              {catName(m.categoryId)} ·{" "}
                              {MATERIAL_UNIT_LABELS[m.unit]} ·{" "}
                              {formatClp(m.costPrice)}
                            </span>
                          </span>
                        </label>
                        <button
                          type="button"
                          title="Editar material"
                          aria-label={`Editar ${m.name}`}
                          onClick={() => setEditorMaterial(m)}
                          className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-strong hover:border-primary hover:bg-primary-soft/30 hover:text-foreground"
                        >
                          Editar
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {error ? (
            <p className="px-5 text-xs text-danger">{error}</p>
          ) : null}

          <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
            <p className="text-xs text-muted">
              {selected.size} seleccionado{selected.size === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-border px-4 py-2 text-sm text-muted-strong hover:bg-hover"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy || selected.size === 0}
                onClick={() => void accept()}
                className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc] disabled:opacity-60"
              >
                {busy ? "Agregando…" : "Aceptar"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {editorMaterial !== null ? (
        <MaterialQuickEditorModal
          material={editorMaterial === "new" ? null : editorMaterial}
          categories={categories}
          onClose={() => setEditorMaterial(null)}
          onSaved={handleMaterialSaved}
        />
      ) : null}
    </>
  );
}
