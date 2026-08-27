"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { MaterialPickerModal } from "@/components/crm/MaterialPickerModal";
import {
  buildQuoteSummary,
  discountPercentForTargetTotalNeto,
  isLaborCategory,
  roundedTotalNetoTarget,
} from "@/lib/crm/quote-summary";
import {
  MATERIAL_UNIT_LABELS,
  MATERIAL_UNITS,
  clientFullName,
  formatClp,
  formatDecimalInput,
  parseDecimalNumber,
} from "@/lib/crm/labels";
import { formatEntityCode } from "@/lib/crm/project-codes";
import type {
  Client,
  Material,
  MaterialCategory,
  MaterialUnit,
  Project,
  QuoteCommercialStatus,
  QuoteLine,
  QuoteWithLines,
} from "@/lib/crm/types";
import {
  QUOTE_COMMERCIAL_STATUS_LABELS,
  quoteCommercialStatusClass,
} from "@/lib/crm/quote-commercial-status";

const TZ = "America/Santiago";

function shortUnit(unit: QuoteLine["unit"]): string {
  const full = MATERIAL_UNIT_LABELS[unit];
  const match = full.match(/\(([^)]+)\)/);
  return match?.[1] ?? unit.toLowerCase();
}

function qtyMap(lines: QuoteLine[]): Map<string, number> {
  return new Map(lines.map((l) => [l.id, l.quantity]));
}

function costMap(lines: QuoteLine[]): Map<string, number> {
  return new Map(lines.map((l) => [l.id, l.unitCost]));
}

function unitMap(lines: QuoteLine[]): Map<string, MaterialUnit> {
  return new Map(lines.map((l) => [l.id, l.unit]));
}

export function QuoteBuilder({
  project,
  client,
  initialQuote,
  materials,
  categories,
  entryFrom = "proyecto",
}: {
  project: Project;
  client: Client;
  initialQuote: QuoteWithLines;
  materials: Material[];
  categories: MaterialCategory[];
  entryFrom?: "cotizador" | "proyecto";
}) {
  const router = useRouter();
  const [quote, setQuote] = useState(initialQuote);
  const [catalogMaterials, setCatalogMaterials] = useState(materials);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyLineId, setBusyLineId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(initialQuote.title);
  const [persistedTitle, setPersistedTitle] = useState(initialQuote.title);
  const [persistedQty, setPersistedQty] = useState(() =>
    qtyMap(initialQuote.lines),
  );
  const [persistedCost, setPersistedCost] = useState(() =>
    costMap(initialQuote.lines),
  );
  const [persistedUnit, setPersistedUnit] = useState(() =>
    unitMap(initialQuote.lines),
  );
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [mermaPercent, setMermaPercent] = useState(
    initialQuote.mermaPercent ?? 0,
  );
  const [utilidadPercent, setUtilidadPercent] = useState(
    initialQuote.utilidadPercent ?? 0,
  );
  const [extraPercent, setExtraPercent] = useState(
    initialQuote.extraPercent ?? 0,
  );
  const [discountPercent, setDiscountPercent] = useState(
    initialQuote.discountPercent ?? 0,
  );
  const [includeIva, setIncludeIva] = useState(
    Boolean(initialQuote.includeIva),
  );
  const [commercialStatus, setCommercialStatus] = useState<QuoteCommercialStatus>(
    initialQuote.commercialStatus ?? "NONE",
  );
  const [warrantyMonths, setWarrantyMonths] = useState(
    initialQuote.warrantyMonths ?? 0,
  );
  const [installmentCount, setInstallmentCount] = useState(
    initialQuote.installmentCount ?? 0,
  );
  const [installmentInterestFree, setInstallmentInterestFree] = useState(
    Boolean(initialQuote.installmentInterestFree),
  );
  const [observations, setObservations] = useState(
    initialQuote.observations ?? "",
  );
  const [showObservations, setShowObservations] = useState(
    initialQuote.showObservations !== false,
  );
  const [persistedMeta, setPersistedMeta] = useState({
    mermaPercent: initialQuote.mermaPercent ?? 0,
    utilidadPercent: initialQuote.utilidadPercent ?? 0,
    extraPercent: initialQuote.extraPercent ?? 0,
    discountPercent: initialQuote.discountPercent ?? 0,
    includeIva: Boolean(initialQuote.includeIva),
    warrantyMonths: initialQuote.warrantyMonths ?? 0,
    installmentCount: initialQuote.installmentCount ?? 0,
    installmentInterestFree: Boolean(initialQuote.installmentInterestFree),
    observations: initialQuote.observations ?? "",
    showObservations: initialQuote.showObservations !== false,
  });
  const [persistedCommercialStatus, setPersistedCommercialStatus] =
    useState<QuoteCommercialStatus>(initialQuote.commercialStatus ?? "NONE");
  const allowLeaveRef = useRef(false);

  const dirty = useMemo(() => {
    if (title.trim() !== persistedTitle.trim()) return true;
    if (quote.lines.length !== persistedQty.size) return true;
    for (const line of quote.lines) {
      if (persistedQty.get(line.id) !== line.quantity) return true;
    }
    if (mermaPercent !== persistedMeta.mermaPercent) return true;
    if (utilidadPercent !== persistedMeta.utilidadPercent) return true;
    if (extraPercent !== persistedMeta.extraPercent) return true;
    if (discountPercent !== persistedMeta.discountPercent) return true;
    if (includeIva !== persistedMeta.includeIva) return true;
    if (warrantyMonths !== persistedMeta.warrantyMonths) return true;
    if (installmentCount !== persistedMeta.installmentCount) return true;
    if (installmentInterestFree !== persistedMeta.installmentInterestFree) {
      return true;
    }
    if (observations !== persistedMeta.observations) return true;
    if (showObservations !== persistedMeta.showObservations) return true;
    if (commercialStatus !== persistedCommercialStatus) return true;
    return false;
  }, [
    title,
    persistedTitle,
    quote.lines,
    persistedQty,
    mermaPercent,
    utilidadPercent,
    extraPercent,
    discountPercent,
    includeIva,
    warrantyMonths,
    installmentCount,
    installmentInterestFree,
    observations,
    showObservations,
    commercialStatus,
    persistedCommercialStatus,
    persistedMeta,
  ]);

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current || allowLeaveRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    if (!dirty) return;

    const onPopState = () => {
      if (allowLeaveRef.current || !dirtyRef.current) return;
      // Reponer la URL actual y pedir confirmación
      window.history.pushState(null, "", window.location.href);
      setLeaveHref("__back__");
    };

    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [dirty]);

  const excludeIds = useMemo(
    () => new Set(quote.lines.map((l) => l.materialId)),
    [quote.lines],
  );

  const summary = useMemo(
    () =>
      buildQuoteSummary(quote.lines, {
        mermaPercent,
        utilidadPercent,
        extraPercent,
        discountPercent,
        includeIva,
      }),
    [
      quote.lines,
      mermaPercent,
      utilidadPercent,
      extraPercent,
      discountPercent,
      includeIva,
    ],
  );

  const totalNetoRounded = useMemo(
    () => roundedTotalNetoTarget(summary.totalNeto, summary.subtotalNeto),
    [summary.totalNeto, summary.subtotalNeto],
  );

  const canRoundTotalNeto =
    quote.lines.length > 0 &&
    summary.subtotalNeto > 0 &&
    Math.abs(summary.totalNeto - totalNetoRounded) >= 0.005;

  async function roundTotalNeto() {
    if (!canRoundTotalNeto) return;
    const nextDiscount = discountPercentForTargetTotalNeto(
      quote.lines,
      {
        mermaPercent,
        utilidadPercent,
        extraPercent,
        discountPercent: 0,
        includeIva,
      },
      totalNetoRounded,
    );
    if (nextDiscount == null) return;
    setDraftSavedAt(null);
    setDiscountPercent(nextDiscount);
    const ok = await saveQuoteMeta({ discountPercent: nextDiscount });
    if (!ok) {
      setDiscountPercent(persistedMeta.discountPercent);
    }
  }

  function requestLeave(href: string) {
    if (!dirtyRef.current || allowLeaveRef.current) {
      navigateTo(href);
      return;
    }
    setLeaveHref(href);
  }

  function navigateTo(href: string) {
    allowLeaveRef.current = true;
    if (href === "__back__") {
      router.back();
      return;
    }
    router.push(href);
  }

  async function saveQuoteMeta(overrides?: {
    mermaPercent?: number;
    utilidadPercent?: number;
    extraPercent?: number;
    discountPercent?: number;
    includeIva?: boolean;
    warrantyMonths?: number;
    installmentCount?: number;
    installmentInterestFree?: boolean;
    observations?: string;
    showObservations?: boolean;
  }): Promise<boolean> {
    const next = {
      mermaPercent: overrides?.mermaPercent ?? mermaPercent,
      utilidadPercent: overrides?.utilidadPercent ?? utilidadPercent,
      extraPercent: overrides?.extraPercent ?? extraPercent,
      discountPercent: overrides?.discountPercent ?? discountPercent,
      includeIva: overrides?.includeIva ?? includeIva,
      warrantyMonths: overrides?.warrantyMonths ?? warrantyMonths,
      installmentCount: overrides?.installmentCount ?? installmentCount,
      installmentInterestFree:
        overrides?.installmentInterestFree ?? installmentInterestFree,
      observations: overrides?.observations ?? observations,
      showObservations: overrides?.showObservations ?? showObservations,
    };
    if (
      next.mermaPercent === persistedMeta.mermaPercent &&
      next.utilidadPercent === persistedMeta.utilidadPercent &&
      next.extraPercent === persistedMeta.extraPercent &&
      next.discountPercent === persistedMeta.discountPercent &&
      next.includeIva === persistedMeta.includeIva &&
      next.warrantyMonths === persistedMeta.warrantyMonths &&
      next.installmentCount === persistedMeta.installmentCount &&
      next.installmentInterestFree === persistedMeta.installmentInterestFree &&
      next.observations === persistedMeta.observations &&
      next.showObservations === persistedMeta.showObservations
    ) {
      return true;
    }
    const res = await fetch(`/api/quotes/${quote.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!res.ok) {
      setError("No se pudieron guardar los datos de la cotización");
      return false;
    }
    setPersistedMeta(next);
    setQuote((q) => ({ ...q, ...next }));
    return true;
  }

  async function saveCommercialStatus(
    next: QuoteCommercialStatus,
  ): Promise<void> {
    setCommercialStatus(next);
    if (next === persistedCommercialStatus) return;
    const res = await fetch(`/api/quotes/${quote.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commercialStatus: next }),
    });
    if (!res.ok) {
      setError("No se pudo actualizar el estado comercial");
      setCommercialStatus(persistedCommercialStatus);
      return;
    }
    setPersistedCommercialStatus(next);
    setQuote((q) => ({ ...q, commercialStatus: next }));
  }

  async function saveTitle(): Promise<boolean> {
    const next = title.trim();
    if (!next) return false;
    if (next === persistedTitle.trim()) return true;
    const res = await fetch(`/api/quotes/${quote.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: next }),
    });
    if (!res.ok) {
      setError("No se pudo guardar el título");
      return false;
    }
    setPersistedTitle(next);
    setQuote((q) => ({ ...q, title: next }));
    return true;
  }

  async function patchLine(
    lineId: string,
    patch: {
      quantity?: number;
      unitCost?: number;
      unit?: MaterialUnit;
    },
  ): Promise<boolean> {
    const current = quote.lines.find((l) => l.id === lineId);
    if (!current) return false;
    const nextQuantity = patch.quantity ?? current.quantity;
    const nextCost = patch.unitCost ?? current.unitCost;
    const nextUnit = patch.unit ?? current.unit;
    if (
      persistedQty.get(lineId) === nextQuantity &&
      persistedCost.get(lineId) === nextCost &&
      persistedUnit.get(lineId) === nextUnit
    ) {
      return true;
    }
    setBusyLineId(lineId);
    setError(null);
    const res = await fetch(`/api/quotes/${quote.id}/lines/${lineId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setBusyLineId(null);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "No se pudo actualizar la línea");
      return false;
    }
    const data = (await res.json()) as { line: QuoteLine };
    setQuote((q) => ({
      ...q,
      lines: q.lines.map((l) => (l.id === lineId ? { ...l, ...data.line } : l)),
    }));
    setPersistedQty((prev) => {
      const next = new Map(prev);
      next.set(lineId, data.line.quantity);
      return next;
    });
    setPersistedCost((prev) => {
      const next = new Map(prev);
      next.set(lineId, data.line.unitCost);
      return next;
    });
    setPersistedUnit((prev) => {
      const next = new Map(prev);
      next.set(lineId, data.line.unit);
      return next;
    });
    return true;
  }

  async function flushPending(): Promise<boolean> {
    const titleOk = await saveTitle();
    if (!titleOk) return false;
    const metaOk = await saveQuoteMeta();
    if (!metaOk) return false;
    for (const line of quote.lines) {
      const ok = await patchLine(line.id, {
        quantity: line.quantity,
        ...(isLaborCategory(line.categoryName)
          ? { unitCost: line.unitCost, unit: line.unit }
          : {}),
      });
      if (!ok) return false;
    }
    return true;
  }

  async function saveDraft() {
    setSavingDraft(true);
    setError(null);
    setDraftSavedAt(null);
    try {
      const ok = await flushPending();
      if (!ok) return;

      const res = await fetch(`/api/quotes/${quote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DRAFT" }),
      });
      if (!res.ok) {
        setError("No se pudo guardar el borrador");
        return;
      }

      setQuote((q) => ({
        ...q,
        status: "DRAFT",
        updatedAt: new Date(),
      }));
      setDraftSavedAt(new Date());
      allowLeaveRef.current = true;
      if (entryFrom === "cotizador") {
        router.push("/cotizador");
      } else {
        router.push(`/proyectos/${project.id}`);
      }
    } finally {
      setSavingDraft(false);
    }
  }

  async function addMaterials(materialIds: string[]) {
    const res = await fetch(`/api/quotes/${quote.id}/lines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ materialIds }),
    });
    const data = (await res.json()) as {
      quote?: QuoteWithLines;
      error?: string;
    };
    if (!res.ok || !data.quote) {
      throw new Error(data.error ?? "No se pudieron agregar materiales");
    }
    const nextQuote = {
      ...data.quote,
      lines: data.quote.lines,
      createdAt: new Date(data.quote.createdAt),
      updatedAt: new Date(data.quote.updatedAt),
    };
    setQuote(nextQuote);
    setPersistedQty(qtyMap(nextQuote.lines));
    setPersistedCost(costMap(nextQuote.lines));
    setPersistedUnit(unitMap(nextQuote.lines));
    setCostDrafts({});
    setQtyDrafts({});
    setPersistedTitle(nextQuote.title);
    setTitle(nextQuote.title);
  }

  async function confirmDeleteLine() {
    if (!deletingId) return;
    setBusyLineId(deletingId);
    const res = await fetch(`/api/quotes/${quote.id}/lines/${deletingId}`, {
      method: "DELETE",
    });
    setBusyLineId(null);
    if (!res.ok) {
      setError("No se pudo eliminar la línea");
      return;
    }
    const removedId = deletingId;
    setQuote((q) => ({
      ...q,
      lines: q.lines.filter((l) => l.id !== removedId),
    }));
    setPersistedQty((prev) => {
      const next = new Map(prev);
      next.delete(removedId);
      return next;
    });
    setPersistedCost((prev) => {
      const next = new Map(prev);
      next.delete(removedId);
      return next;
    });
    setPersistedUnit((prev) => {
      const next = new Map(prev);
      next.delete(removedId);
      return next;
    });
    setCostDrafts((prev) => {
      const next = { ...prev };
      delete next[removedId];
      return next;
    });
    setQtyDrafts((prev) => {
      const next = { ...prev };
      delete next[removedId];
      return next;
    });
    setDeletingId(null);
  }

  async function saveAndLeave() {
    if (!leaveHref) return;
    setLeaving(true);
    setError(null);
    const ok = await flushPending();
    if (ok) {
      await fetch(`/api/quotes/${quote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DRAFT" }),
      });
      setQuote((q) => ({ ...q, status: "DRAFT", updatedAt: new Date() }));
    }
    setLeaving(false);
    if (!ok) return;
    const href = leaveHref;
    setLeaveHref(null);
    navigateTo(href);
  }

  let itemIndex = 0;
  const previewBase = `/proyectos/${project.id}/cotizador/${quote.id}/preview`;
  const previewSimpleHref = `${previewBase}?variant=simple${
    entryFrom === "cotizador" ? "&from=cotizador" : "&from=proyecto"
  }`;
  const previewDetailedHref = `${previewBase}?variant=detailed${
    entryFrom === "cotizador" ? "&from=cotizador" : "&from=proyecto"
  }`;
  const projectHref = `/proyectos/${project.id}`;
  const cotizadorHref = "/cotizador";
  const backLabel =
    entryFrom === "cotizador" ? "Volver al cotizador" : "Volver al proyecto";
  const backHref = entryFrom === "cotizador" ? cotizadorHref : projectHref;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Cotizador · {formatEntityCode(project.publicCode)}
            {quote.quoteCode ? (
              <span className="ml-2 rounded bg-surface-muted px-1.5 py-0.5 font-normal normal-case text-foreground">
                #{quote.quoteCode}
              </span>
            ) : null}
            <span className="ml-2 rounded bg-surface-muted px-1.5 py-0.5 font-normal normal-case text-muted-strong">
              {quote.status === "FINAL" ? "Final" : "Borrador"}
            </span>
            <span
              className={`ml-2 rounded px-1.5 py-0.5 font-normal normal-case ${quoteCommercialStatusClass(commercialStatus)}`}
            >
              {QUOTE_COMMERCIAL_STATUS_LABELS[commercialStatus]}
            </span>
            {dirty ? (
              <span className="ml-2 font-normal normal-case text-[#b06000]">
                · Cambios sin guardar
              </span>
            ) : null}
          </p>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDraftSavedAt(null);
            }}
            onBlur={() => void saveTitle()}
            placeholder={
              quote.quoteCode
                ? `Cotización #${quote.quoteCode}`
                : "Título de la cotización"
            }
            className="mt-1 w-full max-w-md border-0 border-b border-transparent bg-transparent text-xl font-semibold text-foreground outline-none focus:border-primary"
          />
          <p className="mt-1 text-sm text-muted">
            {clientFullName(client)} · Actualizado{" "}
            {formatInTimeZone(
              new Date(quote.updatedAt),
              TZ,
              "dd/MM/yyyy HH:mm",
            )}
            {draftSavedAt ? (
              <span className="ml-2 text-[#137333]">
                · Guardada{" "}
                {draftSavedAt.toLocaleTimeString("es-CL", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            ) : null}
          </p>
          <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-foreground">
            <span className="text-muted">Estado comercial</span>
            <select
              value={commercialStatus}
              onChange={(e) =>
                void saveCommercialStatus(
                  e.target.value as QuoteCommercialStatus,
                )
              }
              className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary"
            >
              {(
                Object.keys(QUOTE_COMMERCIAL_STATUS_LABELS) as QuoteCommercialStatus[]
              ).map((key) => (
                <option key={key} value={key}>
                  {QUOTE_COMMERCIAL_STATUS_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={savingDraft}
            onClick={() => void saveDraft()}
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-60"
          >
            {savingDraft ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc]"
          >
            Añadir materiales
          </button>
          <button
            type="button"
            onClick={() => requestLeave(previewSimpleHref)}
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-muted-strong hover:bg-surface-muted"
          >
            Presupuesto sin detalles
          </button>
          <button
            type="button"
            onClick={() => requestLeave(previewDetailedHref)}
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-muted-strong hover:bg-surface-muted"
          >
            Presupuesto detallado
          </button>
          <button
            type="button"
            onClick={() => requestLeave(backHref)}
            className="rounded-full border border-border px-4 py-2 text-sm text-muted hover:bg-hover"
          >
            {backLabel}
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-surface-muted text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">It.</th>
              <th className="px-3 py-2 font-medium">Categoría</th>
              <th className="px-3 py-2 font-medium">Denominación</th>
              <th className="px-3 py-2 font-medium">Unidades</th>
              <th className="px-3 py-2 font-medium">Cantidad</th>
              <th className="px-3 py-2 font-medium">P/U costo</th>
              <th className="px-3 py-2 font-medium">Sub-total</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {quote.lines.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-10 text-center text-muted"
                >
                  Aún no hay materiales. Usa “Añadir materiales”.
                </td>
              </tr>
            ) : (
              quote.lines.map((line) => {
                itemIndex += 1;
                const sub = line.quantity * line.unitCost;
                const labor = isLaborCategory(line.categoryName);
                const qtyClass =
                  line.quantity > 0
                    ? "bg-[#e6f4ea] text-[#137333]"
                    : "bg-[#fce8e6] text-[#c5221f]";
                return (
                  <tr key={line.id} className="hover:bg-surface-muted/60">
                    <td className="px-3 py-2 text-muted">{itemIndex}</td>
                    <td className="px-3 py-2 text-muted-strong">
                      {line.categoryName}
                    </td>
                    <td className="px-3 py-2 font-medium text-foreground">
                      {line.name}
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {labor ? (
                        <select
                          disabled={busyLineId === line.id}
                          value={line.unit}
                          onChange={(e) => {
                            const unit = e.target.value as MaterialUnit;
                            setDraftSavedAt(null);
                            setQuote((q) => ({
                              ...q,
                              lines: q.lines.map((l) =>
                                l.id === line.id ? { ...l, unit } : l,
                              ),
                            }));
                            void patchLine(line.id, { unit });
                          }}
                          className="rounded border border-border bg-surface px-1 py-1 text-sm outline-none focus:border-primary"
                        >
                          {MATERIAL_UNITS.map((unit) => (
                            <option key={unit} value={unit}>
                              {shortUnit(unit)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        shortUnit(line.unit)
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        disabled={busyLineId === line.id}
                        value={
                          qtyDrafts[line.id] ??
                          formatDecimalInput(line.quantity, 4)
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          setDraftSavedAt(null);
                          setQtyDrafts((prev) => ({
                            ...prev,
                            [line.id]: raw,
                          }));
                          const parsed = parseDecimalNumber(raw, 4);
                          if (parsed === null) return;
                          setQuote((q) => ({
                            ...q,
                            lines: q.lines.map((l) =>
                              l.id === line.id
                                ? { ...l, quantity: parsed }
                                : l,
                            ),
                          }));
                        }}
                        onBlur={(e) => {
                          const parsed =
                            parseDecimalNumber(e.target.value, 4) ??
                            line.quantity;
                          const next = Math.max(0, parsed);
                          setQtyDrafts((prev) => {
                            const copy = { ...prev };
                            delete copy[line.id];
                            return copy;
                          });
                          setQuote((q) => ({
                            ...q,
                            lines: q.lines.map((l) =>
                              l.id === line.id
                                ? { ...l, quantity: next }
                                : l,
                            ),
                          }));
                          void patchLine(line.id, { quantity: next });
                        }}
                        className={`w-24 rounded-lg border border-border bg-surface px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-primary ${qtyClass}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {labor ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          disabled={busyLineId === line.id}
                          value={
                            costDrafts[line.id] ??
                            formatDecimalInput(line.unitCost, 2)
                          }
                          onChange={(e) => {
                            const raw = e.target.value;
                            setDraftSavedAt(null);
                            setCostDrafts((prev) => ({
                              ...prev,
                              [line.id]: raw,
                            }));
                            const parsed = parseDecimalNumber(raw, 2);
                            if (parsed === null) return;
                            setQuote((q) => ({
                              ...q,
                              lines: q.lines.map((l) =>
                                l.id === line.id
                                  ? { ...l, unitCost: parsed }
                                  : l,
                              ),
                            }));
                          }}
                          onBlur={(e) => {
                            const parsed =
                              parseDecimalNumber(e.target.value, 2) ??
                              line.unitCost;
                            const next = Math.max(0, parsed);
                            setCostDrafts((prev) => {
                              const copy = { ...prev };
                              delete copy[line.id];
                              return copy;
                            });
                            setQuote((q) => ({
                              ...q,
                              lines: q.lines.map((l) =>
                                l.id === line.id
                                  ? { ...l, unitCost: next }
                                  : l,
                              ),
                            }));
                            void patchLine(line.id, { unitCost: next });
                          }}
                          className="w-28 rounded-lg border border-border bg-surface px-2 py-1.5 text-right text-sm text-foreground tabular-nums outline-none focus:border-primary"
                        />
                      ) : (
                        formatClp(line.unitCost)
                      )}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-medium ${
                        sub > 0
                          ? "text-foreground"
                          : "bg-[#fce8e6] text-[#c5221f]"
                      }`}
                    >
                      {formatClp(sub)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setDeletingId(line.id)}
                        className="text-xs text-danger hover:underline"
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <h3 className="mb-3 text-sm font-medium text-foreground">Resumen</h3>
        {quote.lines.length === 0 ? (
          <p className="text-sm text-muted">Sin costos aún</p>
        ) : (
          <dl className="space-y-2 text-sm">
            <SummaryRow
              label="Subtotal Mano de Obra"
              value={summary.labor}
            />
            <SummaryRow
              label="Subtotal Logística"
              value={summary.logistics}
            />
            <SummaryRow
              label="Subtotal Materiales"
              value={summary.materials}
              strong
            />
            {summary.materialGroups.map((g) => (
              <SummaryRow
                key={g.categoryName}
                label={g.categoryName}
                value={g.subtotal}
                nested
              />
            ))}

            <div className="border-t border-border pt-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                Porcentajes
              </p>
              <PercentRow
                label="Merma"
                hint="sobre materiales"
                percent={mermaPercent}
                amount={summary.mermaAmount}
                onChange={(value) => {
                  setDraftSavedAt(null);
                  setMermaPercent(value);
                }}
                onCommit={(value) =>
                  void saveQuoteMeta({ mermaPercent: value })
                }
              />
              <PercentRow
                label="Utilidad"
                hint="sobre M.O. + logística + materiales"
                percent={utilidadPercent}
                amount={summary.utilidadAmount}
                onChange={(value) => {
                  setDraftSavedAt(null);
                  setUtilidadPercent(value);
                }}
                onCommit={(value) =>
                  void saveQuoteMeta({ utilidadPercent: value })
                }
              />
              <PercentRow
                label="Extra"
                hint="sobre subtotales + merma + utilidad"
                percent={extraPercent}
                amount={summary.extraAmount}
                onChange={(value) => {
                  setDraftSavedAt(null);
                  setExtraPercent(value);
                }}
                onCommit={(value) =>
                  void saveQuoteMeta({ extraPercent: value })
                }
              />
              <PercentRow
                label="Descuento"
                hint="sobre el subtotal neto (total final)"
                percent={discountPercent}
                amount={summary.discountAmount}
                subtract
                max={100}
                onChange={(value) => {
                  setDraftSavedAt(null);
                  setDiscountPercent(value);
                }}
                onCommit={(value) =>
                  void saveQuoteMeta({ discountPercent: value })
                }
              />
            </div>

            <SummaryRow
              label="Subtotal Neto"
              value={summary.subtotalNeto}
              strong
            />
            <SummaryRow
              label={`Descuento (${summary.discountPercent.toLocaleString("es-CL")}%)`}
              value={-summary.discountAmount}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-base">
              <dt className="font-semibold text-foreground">TOTAL NETO</dt>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {canRoundTotalNeto ? (
                  <button
                    type="button"
                    title={`Ajustar descuento para llegar a ${formatClp(totalNetoRounded)}`}
                    onClick={() => void roundTotalNeto()}
                    className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted-strong transition hover:border-primary hover:bg-primary-soft/30 hover:text-foreground"
                  >
                    Redondear
                  </button>
                ) : null}
                <dd className="tabular-nums font-semibold text-foreground">
                  {formatClp(summary.totalNeto)}
                </dd>
              </div>
            </div>
            <label className="flex cursor-pointer items-center justify-between gap-3 pt-2 text-sm text-foreground">
              <span>Incluir IVA (19%)</span>
              <input
                type="checkbox"
                checked={includeIva}
                onChange={(e) => {
                  const value = e.target.checked;
                  setDraftSavedAt(null);
                  setIncludeIva(value);
                  void saveQuoteMeta({ includeIva: value });
                }}
                className="h-4 w-4 rounded border-border"
              />
            </label>
            {includeIva ? (
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-base">
                <dt className="font-semibold text-foreground">
                  TOTAL + IVA (19%)
                </dt>
                <dd className="tabular-nums font-semibold text-foreground">
                  {formatClp(summary.totalConIva)}
                </dd>
              </div>
            ) : null}
          </dl>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              Observaciones
            </h3>
            <p className="mt-1 text-xs text-muted">
              Texto libre que aparece en la cotización, antes del bloque de
              garantía y condiciones.
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={showObservations}
              onChange={(e) => {
                const value = e.target.checked;
                setDraftSavedAt(null);
                setShowObservations(value);
                void saveQuoteMeta({ showObservations: value });
              }}
              className="h-4 w-4 rounded border-border"
            />
            Mostrar en cotización
          </label>
        </div>
        <textarea
          value={observations}
          rows={4}
          maxLength={4000}
          disabled={!showObservations}
          onChange={(e) => {
            setDraftSavedAt(null);
            setObservations(e.target.value);
          }}
          onBlur={(e) =>
            void saveQuoteMeta({ observations: e.target.value })
          }
          placeholder="Ej.: Incluye retiro de material antiguo, horarios de trabajo, etc."
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
        />
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <h3 className="mb-1 text-sm font-medium text-foreground">
          Condiciones comerciales
        </h3>
        <p className="mb-3 text-xs text-muted">
          Aparecen en el banner de la cotización. Si las cuotas son con interés,
          no se menciona; si son sin interés, se agrega “Sin Interés”.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Garantía (meses)</span>
            <input
              type="number"
              min={0}
              max={120}
              step={1}
              value={warrantyMonths}
              onChange={(e) => {
                setDraftSavedAt(null);
                setWarrantyMonths(parseWhole(e.target.value, 120));
              }}
              onBlur={(e) =>
                void saveQuoteMeta({
                  warrantyMonths: parseWhole(e.target.value, 120),
                })
              }
              className="w-full rounded border border-border bg-surface px-3 py-2 outline-none focus:border-primary"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Cantidad de cuotas</span>
            <input
              type="number"
              min={0}
              max={60}
              step={1}
              value={installmentCount}
              onChange={(e) => {
                setDraftSavedAt(null);
                setInstallmentCount(parseWhole(e.target.value, 60));
              }}
              onBlur={(e) =>
                void saveQuoteMeta({
                  installmentCount: parseWhole(e.target.value, 60),
                })
              }
              className="w-full rounded border border-border bg-surface px-3 py-2 outline-none focus:border-primary"
            />
          </label>
          <fieldset className="block text-sm">
            <legend className="mb-1 text-muted">Interés de cuotas</legend>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={installmentCount <= 0}
                onClick={() => {
                  setDraftSavedAt(null);
                  setInstallmentInterestFree(false);
                  void saveQuoteMeta({ installmentInterestFree: false });
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                  !installmentInterestFree
                    ? "border-primary bg-primary-soft text-foreground"
                    : "border-border text-muted-strong hover:bg-hover"
                }`}
              >
                Con interés
              </button>
              <button
                type="button"
                disabled={installmentCount <= 0}
                onClick={() => {
                  setDraftSavedAt(null);
                  setInstallmentInterestFree(true);
                  void saveQuoteMeta({ installmentInterestFree: true });
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                  installmentInterestFree
                    ? "border-primary bg-primary-soft text-foreground"
                    : "border-border text-muted-strong hover:bg-hover"
                }`}
              >
                Sin interés
              </button>
            </div>
          </fieldset>
        </div>
      </div>

      {pickerOpen ? (
        <MaterialPickerModal
          materials={catalogMaterials}
          categories={categories}
          excludeIds={excludeIds}
          onClose={() => setPickerOpen(false)}
          onAccept={addMaterials}
          onMaterialSaved={(material) => {
            setCatalogMaterials((list) => {
              const idx = list.findIndex((m) => m.id === material.id);
              if (idx >= 0) {
                const next = [...list];
                next[idx] = material;
                return next;
              }
              return [...list, material].sort((a, b) =>
                a.name.localeCompare(b.name, "es"),
              );
            });
          }}
        />
      ) : null}

      {deletingId ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Cerrar"
            onClick={() => setDeletingId(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h4 className="mb-2 text-base font-semibold text-foreground">
              Quitar material
            </h4>
            <p className="mb-4 text-sm text-muted-strong">
              ¿Seguro que quieres quitar esta línea del presupuesto?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingId(null)}
                className="rounded-full border border-border px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteLine()}
                className="rounded-full bg-danger px-4 py-2 text-sm font-medium text-white"
              >
                Quitar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {leaveHref ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Cerrar"
            onClick={() => setLeaveHref(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h4 className="mb-2 text-base font-semibold text-foreground">
              ¿Salir de la cotización?
            </h4>
            <p className="mb-4 text-sm text-muted-strong">
              Tienes cambios sin guardar. Si sales ahora, podrías perder lo
              último que editaste. Puedes guardar esta cotización y salir; sigue
              disponible en Cotizador o en la ficha del proyecto para reabrirla
              después (puedes tener varias por proyecto).
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={leaving}
                onClick={() => setLeaveHref(null)}
                className="rounded-full border border-border px-4 py-2 text-sm"
              >
                Seguir editando
              </button>
              <button
                type="button"
                disabled={leaving}
                onClick={() => {
                  const href = leaveHref;
                  setLeaveHref(null);
                  navigateTo(href);
                }}
                className="rounded-full border border-danger-border px-4 py-2 text-sm text-danger hover:bg-danger-soft"
              >
                Salir sin guardar
              </button>
              <button
                type="button"
                disabled={leaving}
                onClick={() => void saveAndLeave()}
                className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {leaving ? "Guardando…" : "Guardar y salir"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  nested,
  strong,
}: {
  label: string;
  value: number;
  nested?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 ${
        nested ? "pl-4" : ""
      }`}
    >
      <dt
        className={
          nested
            ? "text-muted-strong"
            : strong
              ? "font-medium text-foreground"
              : "text-muted-strong"
        }
      >
        {nested ? `– ${label}` : label}
      </dt>
      <dd
        className={`tabular-nums ${
          nested ? "text-muted-strong" : "font-medium text-foreground"
        }`}
      >
        {formatClp(value)}
      </dd>
    </div>
  );
}

function parsePercent(raw: string, max = 999): number {
  const normalized = raw.replace(",", ".").trim();
  if (normalized === "" || normalized === ".") return 0;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(max, value);
}

function parseWhole(raw: string, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(max, Math.floor(value));
}

function formatPercentInput(value: number) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

function PercentRow({
  label,
  hint,
  percent,
  amount,
  onChange,
  onCommit,
  subtract,
  max = 999,
  step = 1,
}: {
  label: string;
  hint: string;
  percent: number;
  amount: number;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
  subtract?: boolean;
  max?: number;
  step?: number;
}) {
  const [draft, setDraft] = useState(formatPercentInput(percent));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(formatPercentInput(percent));
  }, [percent, focused]);

  const signed =
    amount <= 0
      ? formatClp(amount)
      : subtract
        ? `− ${formatClp(amount)}`
        : `+ ${formatClp(amount)}`;

  function commitDraft(raw: string) {
    const value = parsePercent(raw, max);
    setDraft(formatPercentInput(value));
    onChange(value);
    onCommit(value);
  }

  function nudge(delta: number) {
    const value = Math.min(max, Math.max(0, Math.round((percent + delta) * 100) / 100));
    setDraft(formatPercentInput(value));
    onChange(value);
    onCommit(value);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <dt className="text-sm font-medium text-muted-strong">{label}</dt>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-lg border border-border bg-surface-muted/40">
          <button
            type="button"
            aria-label={`Bajar ${label}`}
            onClick={() => nudge(-step)}
            className="px-2.5 py-1.5 text-sm font-semibold text-muted-strong hover:bg-hover disabled:opacity-40"
            disabled={percent <= 0}
          >
            −
          </button>
          <label className="flex items-center gap-1 border-x border-border px-2 py-1">
            <input
              type="text"
              inputMode="decimal"
              value={draft}
              onFocus={() => setFocused(true)}
              onChange={(e) => {
                const raw = e.target.value;
                if (!/^\d*[.,]?\d*$/.test(raw)) return;
                setDraft(raw);
                onChange(parsePercent(raw, max));
              }}
              onBlur={() => {
                setFocused(false);
                commitDraft(draft);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  nudge(step);
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  nudge(-step);
                }
              }}
              className="w-14 bg-transparent text-center text-sm tabular-nums outline-none"
            />
            <span className="text-xs font-medium text-muted">%</span>
          </label>
          <button
            type="button"
            aria-label={`Subir ${label}`}
            onClick={() => nudge(step)}
            className="px-2.5 py-1.5 text-sm font-semibold text-muted-strong hover:bg-hover disabled:opacity-40"
            disabled={percent >= max}
          >
            +
          </button>
        </div>
        <dd className="min-w-[7.5rem] text-right tabular-nums font-medium text-foreground">
          {signed}
        </dd>
      </div>
    </div>
  );
}
