"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MATERIAL_UNIT_LABELS,
  MATERIAL_UNITS,
  formatClp,
  formatDecimalInput,
  parseDecimalNumber,
} from "@/lib/crm/labels";
import { escapeCsv, unitLabel } from "@/lib/crm/materials-csv";
import type { Material, MaterialCategory, MaterialUnit } from "@/lib/crm/types";

type CategoryDTO = {
  id: string;
  name: string;
  order: number;
};

type MaterialDTO = {
  id: string;
  name: string;
  categoryId: string | null;
  unit: MaterialUnit;
  costPrice: number;
};

type FormState = {
  name: string;
  categoryId: string;
  unit: MaterialUnit;
  costPrice: string;
};

type SortOption = "name-asc" | "name-desc" | "cost-asc" | "cost-desc";

function emptyForm(categoryId = ""): FormState {
  return {
    name: "",
    categoryId,
    unit: "UD",
    costPrice: "",
  };
}

export function MaterialsManager({
  initialMaterials,
  initialCategories,
}: {
  initialMaterials: MaterialDTO[];
  initialCategories: CategoryDTO[];
}) {
  const router = useRouter();
  const [materials, setMaterials] = useState(initialMaterials);
  const [categories, setCategories] = useState(initialCategories);
  const [managingCatalog, setManagingCatalog] = useState(false);
  const [manageQuery, setManageQuery] = useState("");
  const [manageTab, setManageTab] = useState<"materials" | "categories">(
    "materials",
  );
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(
    emptyForm(initialCategories[0]?.id ?? ""),
  );
  const [editForm, setEditForm] = useState<FormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingMaterialIds, setDeletingMaterialIds] = useState<string[]>([]);
  const [deletingCategoryIds, setDeletingCategoryIds] = useState<string[]>([]);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(
    new Set(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [costMin, setCostMin] = useState("");
  const [costMax, setCostMax] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("name-asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<10 | 20 | 50>(10);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pageInput, setPageInput] = useState("1");

  useEffect(() => {
    setMaterials(initialMaterials);
    setCategories(initialCategories);
    setCreateForm((f) => ({
      ...f,
      categoryId: f.categoryId || initialCategories[0]?.id || "",
    }));
  }, [initialMaterials, initialCategories]);

  useEffect(() => {
    if (
      !editingId &&
      deletingMaterialIds.length === 0 &&
      !creating &&
      !creatingCategory &&
      !managingCatalog &&
      deletingCategoryIds.length === 0
    ) {
      return;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (deletingCategoryIds.length > 0) {
          setDeletingCategoryIds([]);
          return;
        }
        if (deletingMaterialIds.length > 0) {
          setDeletingMaterialIds([]);
          return;
        }
        if (plusMenuOpen) {
          setPlusMenuOpen(false);
          return;
        }
        setEditingId(null);
        setCreating(false);
        setCreatingCategory(false);
        setManagingCatalog(false);
        setEditingCategoryId(null);
        setModalError(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    editingId,
    deletingMaterialIds,
    creating,
    creatingCategory,
    managingCatalog,
    deletingCategoryIds,
    plusMenuOpen,
  ]);

  const categoryNameById = useMemo(() => {
    return new Map(categories.map((c) => [c.id, c.name]));
  }, [categories]);

  const deletingMaterials = materials.filter((m) =>
    deletingMaterialIds.includes(m.id),
  );
  const deletingCategories = categories.filter((c) =>
    deletingCategoryIds.includes(c.id),
  );

  const filteredMaterials = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = costMin.trim() === "" ? null : Number(costMin.replace(",", "."));
    const max = costMax.trim() === "" ? null : Number(costMax.replace(",", "."));

    let list = materials.filter((material) => {
      if (
        categoryFilter === "uncategorized" &&
        material.categoryId != null
      ) {
        return false;
      }
      if (
        categoryFilter !== "all" &&
        categoryFilter !== "uncategorized" &&
        material.categoryId !== categoryFilter
      ) {
        return false;
      }
      if (min != null && Number.isFinite(min) && material.costPrice < min) {
        return false;
      }
      if (max != null && Number.isFinite(max) && material.costPrice > max) {
        return false;
      }
      if (!q) return true;
      const category = material.categoryId
        ? (categoryNameById.get(material.categoryId) ?? "")
        : "";
      const haystack = [
        material.name,
        category,
        MATERIAL_UNIT_LABELS[material.unit],
        String(material.costPrice),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    list = [...list].sort((a, b) => {
      if (sortBy === "name-asc") return a.name.localeCompare(b.name, "es");
      if (sortBy === "name-desc") return b.name.localeCompare(a.name, "es");
      if (sortBy === "cost-asc") return a.costPrice - b.costPrice;
      return b.costPrice - a.costPrice;
    });

    return list;
  }, [
    materials,
    query,
    categoryFilter,
    costMin,
    costMax,
    sortBy,
    categoryNameById,
  ]);

  const manageFilteredMaterials = useMemo(() => {
    const q = manageQuery.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter((material) => {
      const category = material.categoryId
        ? (categoryNameById.get(material.categoryId) ?? "sin categoría")
        : "sin categoría";
      return `${material.name} ${category} ${MATERIAL_UNIT_LABELS[material.unit]}`
        .toLowerCase()
        .includes(q);
    });
  }, [materials, manageQuery, categoryNameById]);

  const manageFilteredCategories = useMemo(() => {
    const q = manageQuery.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((category) =>
      category.name.toLowerCase().includes(q),
    );
  }, [categories, manageQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredMaterials.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pagedMaterials = filteredMaterials.slice(
    pageStart,
    pageStart + pageSize,
  );

  useEffect(() => {
    setPage(1);
  }, [query, categoryFilter, costMin, costMax, sortBy, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  function goToPage(raw: string) {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      setPageInput(String(currentPage));
      return;
    }
    const next = Math.min(totalPages, Math.max(1, parsed));
    setPage(next);
    setPageInput(String(next));
  }

  function openCreate() {
    setCreateForm(emptyForm(categories[0]?.id ?? ""));
    setCreating(true);
    setModalError(null);
    setError(null);
  }

  function closeCreate() {
    setCreating(false);
    setModalError(null);
  }

  function openEdit(material: MaterialDTO) {
    setEditingId(material.id);
    setEditForm({
      name: material.name,
      categoryId: material.categoryId ?? categories[0]?.id ?? "",
      unit: material.unit,
      costPrice: formatDecimalInput(material.costPrice, 2),
    });
    setModalError(null);
  }

  function closeEdit() {
    setEditingId(null);
    setModalError(null);
  }

  async function saveMaterial(
    form: FormState,
    id: string | null,
  ): Promise<boolean> {
    const costPrice = parseDecimalNumber(form.costPrice, 2);
    if (!form.name.trim()) {
      setModalError("Ingresa el nombre del material");
      return false;
    }
    if (costPrice == null || costPrice < 0) {
      setModalError("Ingresa un precio de costo válido");
      return false;
    }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      categoryId: form.categoryId || null,
      unit: form.unit,
      costPrice,
    };

    const res = await fetch(id ? `/api/materials/${id}` : "/api/materials", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as {
      material?: Material;
      error?: string;
    };
    setSaving(false);

    if (!res.ok || !data.material) {
      setModalError(data.error ?? "No se pudo guardar el material");
      return false;
    }

    const next: MaterialDTO = {
      id: data.material.id,
      name: data.material.name,
      categoryId: data.material.categoryId,
      unit: data.material.unit,
      costPrice: data.material.costPrice,
    };

    setMaterials((list) => {
      const updated = id
        ? list.map((m) => (m.id === id ? next : m))
        : [...list, next];
      return updated.sort((a, b) => a.name.localeCompare(b.name, "es"));
    });
    router.refresh();
    return true;
  }

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setModalError(null);
    const ok = await saveMaterial(createForm, null);
    if (ok) closeCreate();
  }

  async function onSaveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editingId) return;
    setModalError(null);
    const ok = await saveMaterial(editForm, editingId);
    if (ok) closeEdit();
  }

  async function confirmDelete() {
    if (deletingMaterialIds.length === 0) return;
    setSaving(true);
    setError(null);
    const failed: string[] = [];
    const removed = new Set<string>();
    for (const id of deletingMaterialIds) {
      const res = await fetch(`/api/materials/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        failed.push(data.error ?? "No se pudo eliminar");
        continue;
      }
      removed.add(id);
    }
    setSaving(false);
    if (removed.size > 0) {
      setMaterials((list) => list.filter((m) => !removed.has(m.id)));
      setSelectedMaterialIds((prev) => {
        const next = new Set(prev);
        for (const id of removed) next.delete(id);
        return next;
      });
      if (editingId && removed.has(editingId)) closeEdit();
    }
    setDeletingMaterialIds([]);
    if (failed.length > 0) {
      setError(failed[0] ?? "No se pudieron eliminar algunos materiales");
    }
    router.refresh();
  }

  async function addCategory() {
    const name = categoryName.trim();
    if (!name) {
      setModalError("Ingresa el nombre de la categoría");
      return;
    }
    setSaving(true);
    setError(null);
    setModalError(null);
    const res = await fetch("/api/materials/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = (await res.json()) as {
      category?: MaterialCategory;
      error?: string;
    };
    setSaving(false);
    if (!res.ok || !data.category) {
      const message = data.error ?? "No se pudo crear la categoría";
      setModalError(message);
      setError(message);
      return;
    }
    setCategories((list) => [
      ...list,
      {
        id: data.category!.id,
        name: data.category!.name,
        order: data.category!.order,
      },
    ]);
    setCategoryName("");
    setCreatingCategory(false);
    router.refresh();
  }

  async function saveCategoryName(id: string) {
    const name = editingCategoryName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/materials/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = (await res.json()) as {
      category?: MaterialCategory;
      error?: string;
    };
    setSaving(false);
    if (!res.ok || !data.category) {
      setError(data.error ?? "No se pudo renombrar");
      return;
    }
    setCategories((list) =>
      list.map((c) =>
        c.id === id ? { ...c, name: data.category!.name } : c,
      ),
    );
    setEditingCategoryId(null);
    setEditingCategoryName("");
    router.refresh();
  }

  async function confirmDeleteCategory() {
    if (deletingCategoryIds.length === 0) return;
    setSaving(true);
    setError(null);
    const failed: string[] = [];
    const removed = new Set<string>();
    for (const id of deletingCategoryIds) {
      const res = await fetch(`/api/materials/categories/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        failed.push(data.error ?? "No se pudo eliminar la categoría");
        continue;
      }
      removed.add(id);
    }
    setSaving(false);
    if (removed.size > 0) {
      setCategories((list) => list.filter((c) => !removed.has(c.id)));
      setMaterials((list) =>
        list.map((m) =>
          m.categoryId && removed.has(m.categoryId)
            ? { ...m, categoryId: null }
            : m,
        ),
      );
      setCreateForm((f) =>
        f.categoryId && removed.has(f.categoryId)
          ? { ...f, categoryId: "" }
          : f,
      );
      setSelectedCategoryIds((prev) => {
        const next = new Set(prev);
        for (const id of removed) next.delete(id);
        return next;
      });
      if (editingCategoryId && removed.has(editingCategoryId)) {
        setEditingCategoryId(null);
        setEditingCategoryName("");
      }
    }
    setDeletingCategoryIds([]);
    if (failed.length > 0) {
      setError(failed[0] ?? "No se pudieron eliminar algunas categorías");
    }
    router.refresh();
  }

  function exportCsv() {
    const header = ["nombre", "categoria", "unidad", "costo"];
    const lines = [
      header.join(","),
      ...filteredMaterials.map((material) =>
        [
          escapeCsv(material.name),
          escapeCsv(
            material.categoryId
              ? (categoryNameById.get(material.categoryId) ?? "")
              : "",
          ),
          escapeCsv(unitLabel(material.unit)),
          String(material.costPrice),
        ].join(","),
      ),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `lista-materiales-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importCsv(file: File) {
    setSaving(true);
    setError(null);
    const csv = await file.text();
    const res = await fetch("/api/materials/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    const data = (await res.json()) as {
      created?: number;
      errors?: string[];
      error?: string;
    };
    setSaving(false);
    if (!res.ok) {
      setError(
        data.error ??
          (data.errors?.length ? data.errors.slice(0, 3).join(" · ") : null) ??
          "No se pudo importar el CSV",
      );
      return;
    }
    if (data.errors?.length) {
      setError(
        `Se importaron ${data.created ?? 0}. Avisos: ${data.errors.slice(0, 3).join(" · ")}`,
      );
    }
    router.refresh();
  }

  function clearFilters() {
    setQuery("");
    setCategoryFilter("all");
    setCostMin("");
    setCostMax("");
    setSortBy("name-asc");
    setPage(1);
  }

  const hasActiveFilters =
    categoryFilter !== "all" ||
    costMin.trim() !== "" ||
    costMax.trim() !== "" ||
    sortBy !== "name-asc";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {error ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {/* Toolbar suelta */}
      <div className="shrink-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setPlusMenuOpen((open) => !open)}
              title="Agregar"
              aria-label="Agregar material o categoría"
              aria-expanded={plusMenuOpen}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1a73e8] text-white shadow-sm hover:bg-[#1765cc]"
            >
              <PlusIcon />
            </button>
            {plusMenuOpen ? (
              <>
                <button
                  type="button"
                  aria-label="Cerrar menú"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setPlusMenuOpen(false)}
                />
                <div className="absolute left-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setPlusMenuOpen(false);
                      openCreate();
                    }}
                    className="block w-full px-4 py-2 text-left text-sm text-foreground transition hover:bg-hover"
                  >
                    Agregar material
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPlusMenuOpen(false);
                      setCategoryName("");
                      setModalError(null);
                      setCreatingCategory(true);
                    }}
                    className="block w-full px-4 py-2 text-left text-sm text-foreground transition hover:bg-hover"
                  >
                    Agregar categoría
                  </button>
                </div>
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              setManagingCatalog(true);
              setManageTab("materials");
              setSelectedMaterialIds(new Set());
              setSelectedCategoryIds(new Set());
              setManageQuery("");
              setError(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-strong hover:bg-hover"
          >
            Gestionar
          </button>
          <div className="relative min-w-[200px] flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              <SearchIcon />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar material, categoría, unidad…"
              className="w-full rounded-full border border-border bg-surface py-2.5 pl-10 pr-3 text-sm shadow-sm outline-none focus:border-primary"
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              filtersOpen || hasActiveFilters
                ? "border-primary bg-primary-soft text-primary-text"
                : "border-border bg-surface text-muted-strong hover:bg-hover"
            }`}
          >
            <FilterIcon />
            Filtros
            {hasActiveFilters ? (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-white">
                !
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-strong hover:bg-hover"
          >
            Exportar CSV
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-strong hover:bg-hover disabled:opacity-60"
          >
            Importar CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void importCsv(file);
            }}
          />
        </div>

        {filtersOpen ? (
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-sm">
                <span className="mb-1 block text-muted">Categoría</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-primary"
                >
                  <option value="all">Todas</option>
                  <option value="uncategorized">Sin categoría</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-muted">Costo mínimo</span>
                <input
                  inputMode="numeric"
                  value={costMin}
                  onChange={(e) => setCostMin(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-primary"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-muted">Costo máximo</span>
                <input
                  inputMode="numeric"
                  value={costMax}
                  onChange={(e) => setCostMax(e.target.value)}
                  placeholder="Sin límite"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-primary"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-muted">Ordenar</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-primary"
                >
                  <option value="name-asc">Nombre A → Z</option>
                  <option value="name-desc">Nombre Z → A</option>
                  <option value="cost-asc">Costo menor → mayor</option>
                  <option value="cost-desc">Costo mayor → menor</option>
                </select>
              </label>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-full px-3 py-1 text-xs font-medium text-primary-text hover:bg-primary-soft"
              >
                Limpiar filtros
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Lista */}
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-xs text-muted">
          <p>
            {filteredMaterials.length === 0
              ? `0 de ${materials.length} materiales`
              : `${pageStart + 1}–${Math.min(pageStart + pageSize, filteredMaterials.length)} de ${filteredMaterials.length}`}
          </p>
          {query.trim() || hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-full px-2 py-1 text-primary-text hover:bg-primary-soft"
            >
              Limpiar búsqueda
            </button>
          ) : null}
        </div>

        <div className="crm-scroll min-h-0 flex-1 overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-surface-muted/95 text-muted backdrop-blur">
              <tr>
                <th className="px-4 py-2.5 font-medium">Material</th>
                <th className="px-4 py-2.5 font-medium">Categoría</th>
                <th className="px-4 py-2.5 font-medium">Unidad</th>
                <th className="px-4 py-2.5 text-right font-medium">Costo</th>
                <th className="min-w-[9.5rem] px-4 py-2.5 text-right font-medium">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {pagedMaterials.map((material) => {
                return (
                  <tr
                    key={material.id}
                    className="group border-b border-border/70 last:border-b-0 hover:bg-surface-muted/70"
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      {material.name}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex max-w-[14rem] truncate rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary-text">
                        {material.categoryId
                          ? (categoryNameById.get(material.categoryId) ??
                            "Sin categoría")
                          : "Sin categoría"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted">
                      {MATERIAL_UNIT_LABELS[material.unit]}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-strong">
                      {formatClp(material.costPrice)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => openEdit(material)}
                          title="Editar"
                          aria-label={`Editar ${material.name}`}
                          className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-primary-text hover:border-primary hover:bg-primary-soft disabled:opacity-60"
                        >
                          <PencilIcon />
                          <span className="hidden sm:inline">Editar</span>
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => setDeletingMaterialIds([material.id])}
                          title="Eliminar"
                          aria-label={`Eliminar ${material.name}`}
                          className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-danger hover:border-danger hover:bg-danger-soft disabled:opacity-60"
                        >
                          <TrashIcon />
                          <span className="hidden sm:inline">Eliminar</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredMaterials.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center">
              <p className="text-sm text-muted">
                {materials.length === 0
                  ? "Aún no hay materiales en el catálogo."
                  : "No hay resultados con esta búsqueda."}
              </p>
              {materials.length === 0 ? (
                <button
                  type="button"
                  onClick={openCreate}
                  className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc]"
                >
                  Agregar material
                </button>
              ) : (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-full px-3 py-1.5 text-sm text-primary-text hover:bg-primary-soft"
                >
                  Limpiar búsqueda
                </button>
              )}
            </div>
          ) : null}
        </div>

        {filteredMaterials.length > 0 ? (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-muted">
              <span>Por página</span>
              <select
                value={pageSize}
                onChange={(e) =>
                  setPageSize(Number(e.target.value) as 10 | 20 | 50)
                }
                className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                aria-label="Cantidad de ítems por página"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-strong hover:bg-hover disabled:opacity-40"
              >
                Anterior
              </button>
              <label className="flex items-center gap-1.5 text-sm text-muted">
                <span>Página</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={pageInput}
                  onChange={(e) =>
                    setPageInput(e.target.value.replace(/[^\d]/g, ""))
                  }
                  onBlur={() => goToPage(pageInput)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      goToPage(pageInput);
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className="w-12 rounded-lg border border-border bg-surface px-2 py-1 text-center text-sm text-foreground outline-none focus:border-primary"
                  aria-label="Ir a página"
                />
                <span>de {totalPages}</span>
              </label>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-strong hover:bg-hover disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {managingCatalog ? (
        <Modal
          title="Gestionar catálogo"
          wide
          extraWide
          onClose={() => {
            setManagingCatalog(false);
            setEditingCategoryId(null);
            setEditingCategoryName("");
            setSelectedMaterialIds(new Set());
            setSelectedCategoryIds(new Set());
            setManageQuery("");
          }}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setManageTab("materials")}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                manageTab === "materials"
                  ? "bg-primary-soft text-primary-text"
                  : "text-muted hover:bg-hover"
              }`}
            >
              Materiales
            </button>
            <button
              type="button"
              onClick={() => setManageTab("categories")}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                manageTab === "categories"
                  ? "bg-primary-soft text-primary-text"
                  : "text-muted hover:bg-hover"
              }`}
            >
              Categorías
            </button>
            {manageTab === "materials" && selectedMaterialIds.size > 0 ? (
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  setDeletingMaterialIds([...selectedMaterialIds])
                }
                className="ml-auto rounded-full border border-danger px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-soft disabled:opacity-60"
              >
                Eliminar {selectedMaterialIds.size} seleccionado
                {selectedMaterialIds.size === 1 ? "" : "s"}
              </button>
            ) : null}
            {manageTab === "categories" && selectedCategoryIds.size > 0 ? (
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  setDeletingCategoryIds([...selectedCategoryIds])
                }
                className="ml-auto rounded-full border border-danger px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-soft disabled:opacity-60"
              >
                Eliminar {selectedCategoryIds.size} seleccionada
                {selectedCategoryIds.size === 1 ? "" : "s"}
              </button>
            ) : null}
          </div>

          <div className="relative mb-3">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              <SearchIcon />
            </span>
            <input
              value={manageQuery}
              onChange={(e) => setManageQuery(e.target.value)}
              placeholder={
                manageTab === "materials"
                  ? "Buscar material…"
                  : "Buscar categoría…"
              }
              className="w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>

          {manageTab === "materials" ? (
            <ul className="max-h-[55vh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {manageFilteredMaterials.length === 0 ? (
                <li className="px-3 py-8 text-center text-sm text-muted">
                  {materials.length === 0
                    ? "No hay materiales"
                    : "Sin resultados"}
                </li>
              ) : (
                manageFilteredMaterials.map((material) => {
                  const checked = selectedMaterialIds.has(material.id);
                  return (
                    <li
                      key={material.id}
                      className="flex items-center gap-3 px-3 py-2.5"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedMaterialIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(material.id)) next.delete(material.id);
                            else next.add(material.id);
                            return next;
                          });
                        }}
                        className="accent-[#1a73e8]"
                        aria-label={`Seleccionar ${material.name}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">
                          {material.name}
                        </span>
                        <span className="block text-xs text-muted">
                          {material.categoryId
                            ? (categoryNameById.get(material.categoryId) ??
                              "Sin categoría")
                            : "Sin categoría"}{" "}
                          · {MATERIAL_UNIT_LABELS[material.unit]} ·{" "}
                          {formatClp(material.costPrice)}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => openEdit(material)}
                        className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-primary-text hover:bg-primary-soft"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => setDeletingMaterialIds([material.id])}
                        className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger-soft disabled:opacity-60"
                      >
                        Eliminar
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          ) : (
            <ul className="max-h-[55vh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {manageFilteredCategories.length === 0 ? (
                <li className="px-3 py-8 text-center text-sm text-muted">
                  {categories.length === 0
                    ? "No hay categorías"
                    : "Sin resultados"}
                </li>
              ) : (
                manageFilteredCategories.map((category) => {
                  const checked = selectedCategoryIds.has(category.id);
                  const count = materials.filter(
                    (m) => m.categoryId === category.id,
                  ).length;
                  return (
                    <li
                      key={category.id}
                      className="flex flex-wrap items-center gap-2 px-3 py-2.5"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedCategoryIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(category.id)) next.delete(category.id);
                            else next.add(category.id);
                            return next;
                          });
                        }}
                        className="accent-[#1a73e8]"
                        aria-label={`Seleccionar ${category.name}`}
                      />
                      {editingCategoryId === category.id ? (
                        <>
                          <input
                            autoFocus
                            value={editingCategoryName}
                            onChange={(e) =>
                              setEditingCategoryName(e.target.value)
                            }
                            className="min-w-0 flex-1 rounded border border-primary px-2 py-1 text-sm outline-none"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void saveCategoryName(category.id);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => void saveCategoryName(category.id)}
                            className="rounded-full px-3 py-1 text-sm text-primary-text hover:bg-primary-soft"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCategoryId(null);
                              setEditingCategoryName("");
                            }}
                            className="rounded-full px-3 py-1 text-sm text-muted hover:bg-hover"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="min-w-0 flex-1 text-sm text-foreground">
                            {category.name}
                            <span className="ml-2 text-xs text-muted">
                              {count} material{count === 1 ? "" : "es"}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCategoryId(category.id);
                              setEditingCategoryName(category.name);
                            }}
                            className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-primary-text hover:bg-primary-soft"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() =>
                              setDeletingCategoryIds([category.id])
                            }
                            className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger-soft disabled:opacity-60"
                          >
                            Eliminar
                          </button>
                        </>
                      )}
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </Modal>
      ) : null}

      {creatingCategory ? (
        <Modal
          title="Agregar categoría"
          onClose={() => {
            setCreatingCategory(false);
            setCategoryName("");
            setModalError(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void addCategory();
            }}
            className="space-y-4"
          >
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Nombre</span>
              <input
                autoFocus
                required
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="Ej. Electricidad"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-primary"
              />
            </label>
            {modalError ? (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                {modalError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCreatingCategory(false);
                  setCategoryName("");
                  setModalError(null);
                }}
                className="rounded-full border border-border px-4 py-2 text-sm text-muted-strong hover:bg-hover"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc] disabled:opacity-60"
              >
                Guardar
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {creating ? (
        <Modal title="Agregar material" onClose={closeCreate}>
          <form onSubmit={(e) => void onCreate(e)} className="space-y-4">
            <MaterialFields
              form={createForm}
              categories={categories}
              onChange={setCreateForm}
            />
            {modalError ? (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                {modalError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeCreate}
                className="rounded-full border border-border px-4 py-2 text-sm text-muted-strong hover:bg-hover"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc] disabled:opacity-60"
              >
                Guardar
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editingId ? (
        <Modal title="Editar material" onClose={closeEdit}>
          <form onSubmit={(e) => void onSaveEdit(e)} className="space-y-4">
            <MaterialFields
              form={editForm}
              categories={categories}
              onChange={setEditForm}
            />
            {modalError ? (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                {modalError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeEdit}
                className="rounded-full border border-border px-4 py-2 text-sm text-muted-strong hover:bg-hover"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc] disabled:opacity-60"
              >
                Guardar
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {deletingMaterials.length > 0 ? (
        <Modal
          title={
            deletingMaterials.length === 1
              ? "Eliminar material"
              : "Eliminar materiales"
          }
          onClose={() => setDeletingMaterialIds([])}
        >
          <p className="text-sm text-muted-strong">
            {deletingMaterials.length === 1 ? (
              <>
                ¿Seguro que quieres eliminar{" "}
                <span className="font-medium text-foreground">
                  {deletingMaterials[0]?.name}
                </span>
                ? Esta acción no se puede deshacer.
              </>
            ) : (
              <>
                ¿Seguro que quieres eliminar{" "}
                <span className="font-medium text-foreground">
                  {deletingMaterials.length} materiales
                </span>
                ? Esta acción no se puede deshacer.
              </>
            )}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeletingMaterialIds([])}
              className="rounded-full border border-border px-4 py-2 text-sm text-muted-strong hover:bg-hover"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void confirmDelete()}
              className="rounded-full bg-[#d93025] px-4 py-2 text-sm font-medium text-white hover:bg-[#c5221f] disabled:opacity-60"
            >
              Eliminar
            </button>
          </div>
        </Modal>
      ) : null}

      {deletingCategories.length > 0 ? (
        <Modal
          title={
            deletingCategories.length === 1
              ? "Eliminar categoría"
              : "Eliminar categorías"
          }
          onClose={() => setDeletingCategoryIds([])}
        >
          <p className="text-sm text-muted-strong">
            {deletingCategories.length === 1 ? (
              <>
                ¿Seguro que quieres eliminar{" "}
                <span className="font-medium text-foreground">
                  {deletingCategories[0]?.name}
                </span>
                ? Los materiales de esta categoría quedarán con el tag{" "}
                <span className="font-medium text-foreground">
                  Sin categoría
                </span>
                . Esta acción no se puede deshacer.
              </>
            ) : (
              <>
                ¿Seguro que quieres eliminar{" "}
                <span className="font-medium text-foreground">
                  {deletingCategories.length} categorías
                </span>
                ? Los materiales asignados quedarán con el tag{" "}
                <span className="font-medium text-foreground">
                  Sin categoría
                </span>
                . Esta acción no se puede deshacer.
              </>
            )}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeletingCategoryIds([])}
              className="rounded-full border border-border px-4 py-2 text-sm text-muted-strong hover:bg-hover"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void confirmDeleteCategory()}
              className="rounded-full bg-[#d93025] px-4 py-2 text-sm font-medium text-white hover:bg-[#c5221f] disabled:opacity-60"
            >
              Eliminar
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function MaterialFields({
  form,
  categories,
  onChange,
}: {
  form: FormState;
  categories: CategoryDTO[];
  onChange: (form: FormState) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="block text-sm md:col-span-2">
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
          value={form.categoryId}
          onChange={(e) => onChange({ ...form, categoryId: e.target.value })}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-primary"
        >
          <option value="">Sin categoría</option>
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

      <label className="block text-sm md:col-span-2">
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

function Modal({
  title,
  onClose,
  children,
  wide = false,
  extraWide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  extraWide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/35"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div
        className={`relative z-10 w-full rounded-xl border border-border bg-surface p-5 shadow-xl ${
          extraWide ? "max-w-2xl" : wide ? "max-w-xl" : "max-w-lg"
        }`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-lg leading-none text-muted hover:bg-hover"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 5h16l-6 7v5l-4 2v-7L4 5z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
