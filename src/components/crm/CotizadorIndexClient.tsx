"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { clientFullName, formatClp } from "@/lib/crm/labels";
import { formatEntityCode } from "@/lib/crm/project-codes";
import { canDeleteQuote } from "@/lib/crm/quote-delete";
import {
  QUOTE_COMMERCIAL_STATUS_LABELS,
  quoteCommercialStatusClass,
} from "@/lib/crm/quote-commercial-status";
import { CommercialAddressModal } from "@/components/crm/CommercialAddressModal";
import {
  QuoteActionIconRow,
  QuoteCloneIconButton,
  QuoteDeleteIconButton,
  QuoteEditIconButton,
  QuotePreviewIconButton,
} from "@/components/crm/QuoteRowActions";
import type {
  CompanySettings,
  Quote,
  QuoteCommercialStatus,
  QuoteWithProject,
} from "@/lib/crm/types";

const TZ = "America/Santiago";

export type CotizadorProjectOption = {
  id: string;
  publicCode: string;
  title: string | null;
  clientName: string;
  address: string | null;
};

export type CotizadorQuoteRow = QuoteWithProject & {
  totalNeto: number;
  includeIva: boolean;
  totalConIva: number;
};

type CreateMode = "blank" | "clone";

export function CotizadorIndexClient({
  quotes: initialQuotes,
  projects,
  initialCompanySettings,
}: {
  quotes: CotizadorQuoteRow[];
  projects: CotizadorProjectOption[];
  initialCompanySettings: Pick<CompanySettings, "commercialAddress" | "phone">;
}) {
  const router = useRouter();
  const [quotes, setQuotes] = useState(initialQuotes);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [companySettings, setCompanySettings] = useState(initialCompanySettings);
  const [listQuery, setListQuery] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [createMode, setCreateMode] = useState<CreateMode>("blank");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cloneCode, setCloneCode] = useState("");
  const [sourceQuote, setSourceQuote] = useState<QuoteWithProject | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [cloneTargetId, setCloneTargetId] = useState<string>("");
  const createMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuotes(initialQuotes);
  }, [initialQuotes]);

  useEffect(() => {
    if (!createMenuOpen) return;
    function onClick(event: MouseEvent) {
      if (!createMenuRef.current?.contains(event.target as Node)) {
        setCreateMenuOpen(false);
      }
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [createMenuOpen]);

  const filteredProjects = useMemo(() => {
    const q = projectQuery.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const hay =
        `${p.publicCode} ${p.clientName} ${p.title ?? ""} ${p.address ?? ""}`.toLowerCase();
      return (
        hay.includes(q) ||
        formatEntityCode(p.publicCode).toLowerCase().includes(q)
      );
    });
  }, [projects, projectQuery]);

  const filteredQuotes = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return quotes;
    return quotes.filter((quote) => {
      const hay = [
        quote.quoteCode ?? "",
        quote.title,
        quote.project.publicCode,
        formatEntityCode(quote.project.publicCode),
        clientFullName(quote.client),
        quote.project.title ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [quotes, listQuery]);

  const cloneSourceOptions = useMemo(() => {
    const q = cloneCode.trim().toLowerCase().replace(/^#/, "");
    if (!q) return quotes.slice(0, 24);
    return quotes.filter((quote) => {
      const hay = [
        quote.quoteCode ?? "",
        quote.title,
        quote.project.publicCode,
        clientFullName(quote.client),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [quotes, cloneCode]);

  function openCreate(mode: CreateMode) {
    setCreateMenuOpen(false);
    setCreateMode(mode);
    setPickerOpen(true);
    setSelectedId(null);
    setProjectQuery("");
    setCloneCode("");
    setSourceQuote(null);
    setError(null);
  }

  async function lookupByCode() {
    const code = cloneCode.trim();
    if (!code || lookingUp) return;
    setLookingUp(true);
    setError(null);
    try {
      const local = quotes.find(
        (q) =>
          q.quoteCode &&
          q.quoteCode.replace(/^#/, "").toLowerCase() ===
            code.replace(/^#/, "").toLowerCase(),
      );
      if (local) {
        setSourceQuote(local);
        return;
      }
      const res = await fetch(
        `/api/quotes/by-code?code=${encodeURIComponent(code)}`,
      );
      const data = (await res.json()) as {
        quote?: QuoteWithProject;
        error?: string;
      };
      if (!res.ok || !data.quote) {
        setError(data.error ?? "No se encontró esa cotización");
        return;
      }
      setSourceQuote(data.quote);
    } catch {
      setError("Error de red al buscar la cotización");
    } finally {
      setLookingUp(false);
    }
  }

  async function createForProject() {
    if (!selectedId || busy) return;
    if (createMode === "clone" && !sourceQuote) {
      setError("Elige una cotización de origen antes de clonar");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (createMode === "clone" && sourceQuote) {
        const res = await fetch(`/api/quotes/${sourceQuote.id}/clone`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: selectedId }),
        });
        const data = (await res.json()) as { quote?: Quote; error?: string };
        if (!res.ok || !data.quote) {
          setError(data.error ?? "No se pudo clonar la cotización");
          return;
        }
        setPickerOpen(false);
        router.push(
          `/proyectos/${selectedId}/cotizador/${data.quote.id}?from=cotizador`,
        );
        return;
      }

      const res = await fetch(`/api/projects/${selectedId}/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { quote?: Quote; error?: string };
      if (!res.ok || !data.quote) {
        setError(data.error ?? "No se pudo crear la cotización");
        return;
      }
      setPickerOpen(false);
      router.push(
        `/proyectos/${selectedId}/cotizador/${data.quote.id}?from=cotizador`,
      );
    } catch {
      setError(
        createMode === "clone"
          ? "Error de red al clonar la cotización"
          : "Error de red al crear la cotización",
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateCommercialStatus(
    quoteId: string,
    commercialStatus: QuoteCommercialStatus,
  ) {
    setError(null);
    const res = await fetch(`/api/quotes/${quoteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commercialStatus }),
    });
    if (!res.ok) {
      setError("No se pudo actualizar el estado comercial");
      return;
    }
    setQuotes((prev) =>
      prev.map((q) => (q.id === quoteId ? { ...q, commercialStatus } : q)),
    );
  }

  async function confirmDelete() {
    if (!deletingId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${deletingId}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "No se pudo eliminar la cotización");
        return;
      }
      setQuotes((prev) => prev.filter((q) => q.id !== deletingId));
      setDeletingId(null);
      router.refresh();
    } catch {
      setError("Error de red al eliminar");
    } finally {
      setBusy(false);
    }
  }

  async function confirmClone() {
    if (!cloningId || !cloneTargetId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${cloningId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: cloneTargetId }),
      });
      const data = (await res.json()) as { quote?: Quote; error?: string };
      if (!res.ok || !data.quote) {
        setError(data.error ?? "No se pudo clonar la cotización");
        return;
      }
      setCloningId(null);
      router.push(
        `/proyectos/${cloneTargetId}/cotizador/${data.quote.id}?from=cotizador`,
      );
    } catch {
      setError("Error de red al clonar la cotización");
    } finally {
      setBusy(false);
    }
  }

  function quoteLabel(quote: QuoteWithProject) {
    if (quote.quoteCode) return `Cotización #${quote.quoteCode}`;
    return quote.title;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <label className="relative min-w-0 max-w-sm flex-1">
          <span className="sr-only">Buscar cotizaciones</span>
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={listQuery}
            onChange={(e) => setListQuery(e.target.value)}
            placeholder="Buscar por código, cliente o proyecto…"
            className="h-8 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAddressOpen(true)}
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-muted"
          >
            Modificar información comercial
          </button>
          <div className="relative" ref={createMenuRef}>
            <button
              type="button"
              onClick={() => setCreateMenuOpen((open) => !open)}
              className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc]"
            >
              + Nueva cotización
            </button>
            {createMenuOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl">
                <button
                  type="button"
                  onClick={() => openCreate("blank")}
                  className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-surface-muted"
                >
                  <span className="text-sm font-medium text-foreground">
                    Crear nueva cotización
                  </span>
                  <span className="text-xs text-muted">
                    Desde cero, en un proyecto
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openCreate("clone")}
                  className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-surface-muted"
                >
                  <span className="text-sm font-medium text-foreground">
                    Crear a partir de cotización existente
                  </span>
                  <span className="text-xs text-muted">
                    Clona ítems y porcentajes
                  </span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {error && !pickerOpen && !deletingId && !cloningId ? (
        <p className="rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface">
        {quotes.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            Aún no hay cotizaciones. Usa “+ Nueva cotización” para empezar.
          </p>
        ) : filteredQuotes.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            No hay cotizaciones que coincidan con la búsqueda.
          </p>
        ) : (
          <div className="crm-scroll min-h-0 flex-1 overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-surface-muted text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Cotización</th>
                  <th className="px-4 py-3 font-medium">Proyecto</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Total neto</th>
                  <th className="px-4 py-3 font-medium">Actualizado</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredQuotes.map((quote) => {
                  const deletable = canDeleteQuote(quote.createdAt);
                  const status = quote.commercialStatus ?? "NONE";
                  return (
                    <tr key={quote.id} className="hover:bg-surface-muted">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">
                          {quoteLabel(quote)}
                        </p>
                        <p className="text-xs text-muted">
                          {quote.status === "FINAL" ? "Final" : "Borrador"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/proyectos/${quote.projectId}`}
                          className="text-primary hover:underline"
                        >
                          {formatEntityCode(quote.project.publicCode)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-strong">
                        {clientFullName(quote.client)}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={status}
                          onChange={(e) =>
                            void updateCommercialStatus(
                              quote.id,
                              e.target.value as QuoteCommercialStatus,
                            )
                          }
                          className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium outline-none ${quoteCommercialStatusClass(status)}`}
                        >
                          {(
                            Object.keys(
                              QUOTE_COMMERCIAL_STATUS_LABELS,
                            ) as QuoteCommercialStatus[]
                          ).map((key) => (
                            <option key={key} value={key}>
                              {QUOTE_COMMERCIAL_STATUS_LABELS[key]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="tabular-nums font-medium text-foreground">
                          {formatClp(quote.totalNeto)}
                        </p>
                        {quote.includeIva ? (
                          <p className="text-xs tabular-nums text-muted">
                            + IVA {formatClp(quote.totalConIva)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {formatInTimeZone(
                          new Date(quote.updatedAt),
                          TZ,
                          "dd/MM/yyyy HH:mm",
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <QuoteActionIconRow>
                          <QuotePreviewIconButton
                            href={`/proyectos/${quote.projectId}/cotizador/${quote.id}/preview?from=cotizador`}
                          />
                          <QuoteEditIconButton
                            href={`/proyectos/${quote.projectId}/cotizador/${quote.id}?from=cotizador`}
                          />
                          <QuoteCloneIconButton
                            onClick={() => {
                              setError(null);
                              setCloningId(quote.id);
                              setCloneTargetId(quote.projectId);
                              setProjectQuery("");
                            }}
                          />
                          {deletable ? (
                            <QuoteDeleteIconButton
                              onClick={() => {
                                setError(null);
                                setDeletingId(quote.id);
                              }}
                            />
                          ) : null}
                        </QuoteActionIconRow>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {addressOpen ? (
        <CommercialAddressModal
          initialSettings={companySettings}
          onClose={() => setAddressOpen(false)}
          onSaved={setCompanySettings}
        />
      ) : null}

      {pickerOpen ? (
        <CreateQuoteModal
          mode={createMode}
          busy={busy}
          error={error}
          projects={filteredProjects}
          quotes={cloneSourceOptions}
          selectedId={selectedId}
          sourceQuote={sourceQuote}
          projectQuery={projectQuery}
          cloneCode={cloneCode}
          lookingUp={lookingUp}
          onClose={() => !busy && setPickerOpen(false)}
          onSelectProject={setSelectedId}
          onSelectSource={setSourceQuote}
          onClearSource={() => setSourceQuote(null)}
          onProjectQuery={setProjectQuery}
          onCloneCode={setCloneCode}
          onLookup={() => void lookupByCode()}
          onSubmit={() => void createForProject()}
          quoteLabel={quoteLabel}
        />
      ) : null}

      {deletingId ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Cerrar"
            onClick={() => !busy && setDeletingId(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h4 className="mb-2 text-base font-semibold text-foreground">
              Eliminar cotización
            </h4>
            <p className="mb-4 text-sm text-muted-strong">
              ¿Seguro que quieres eliminar esta cotización? Solo es posible
              dentro de las primeras 48 horas. El código no se reutiliza.
            </p>
            {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeletingId(null)}
                className="rounded-full border border-border px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmDelete()}
                className="rounded-full bg-danger px-4 py-2 text-sm font-medium text-white"
              >
                {busy ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cloningId ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Cerrar"
            onClick={() => !busy && setCloningId(null)}
          />
          <div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
            <div className="border-b border-border px-5 py-4">
              <h4 className="text-base font-semibold text-foreground">
                Clonar cotización
              </h4>
              <p className="text-xs text-muted">
                El código se genera nuevo según el proyecto destino.
              </p>
            </div>
            <div className="border-b border-border px-5 py-3">
              <input
                value={projectQuery}
                onChange={(e) => setProjectQuery(e.target.value)}
                placeholder="Buscar proyecto destino…"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="crm-scroll min-h-0 flex-1 overflow-y-auto p-4">
              <ProjectCardGrid
                projects={filteredProjects}
                selectedId={cloneTargetId}
                onSelect={setCloneTargetId}
              />
            </div>
            {error ? (
              <p className="px-5 py-2 text-sm text-danger">{error}</p>
            ) : null}
            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => setCloningId(null)}
                className="rounded-full border border-border px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy || !cloneTargetId}
                onClick={() => void confirmClone()}
                className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy ? "Clonando…" : "Clonar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CreateQuoteModal({
  mode,
  busy,
  error,
  projects,
  quotes,
  selectedId,
  sourceQuote,
  projectQuery,
  cloneCode,
  lookingUp,
  onClose,
  onSelectProject,
  onSelectSource,
  onClearSource,
  onProjectQuery,
  onCloneCode,
  onLookup,
  onSubmit,
  quoteLabel,
}: {
  mode: CreateMode;
  busy: boolean;
  error: string | null;
  projects: CotizadorProjectOption[];
  quotes: CotizadorQuoteRow[];
  selectedId: string | null;
  sourceQuote: QuoteWithProject | null;
  projectQuery: string;
  cloneCode: string;
  lookingUp: boolean;
  onClose: () => void;
  onSelectProject: (id: string) => void;
  onSelectSource: (quote: QuoteWithProject) => void;
  onClearSource: () => void;
  onProjectQuery: (value: string) => void;
  onCloneCode: (value: string) => void;
  onLookup: () => void;
  onSubmit: () => void;
  quoteLabel: (quote: QuoteWithProject) => string;
}) {
  const choosingSource = mode === "clone" && !sourceQuote;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/35"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold text-foreground">
            {mode === "blank"
              ? "Crear nueva cotización"
              : "Crear a partir de cotización existente"}
          </h3>
          <p className="text-xs text-muted">
            {mode === "blank"
              ? "Elige el proyecto al que se asignará"
              : choosingSource
                ? "Elige la cotización de origen"
                : "Ahora elige el proyecto destino"}
          </p>
        </div>

        {choosingSource ? (
          <>
            <div className="border-b border-border px-5 py-3">
              <div className="flex gap-2">
                <input
                  value={cloneCode}
                  onChange={(e) => onCloneCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onLookup();
                    }
                  }}
                  placeholder="Buscar por código, cliente o proyecto…"
                  className="min-w-0 flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                  autoFocus
                />
                <button
                  type="button"
                  disabled={lookingUp || !cloneCode.trim()}
                  onClick={onLookup}
                  className="rounded-full border border-border px-3 py-2 text-sm hover:bg-hover disabled:opacity-60"
                >
                  {lookingUp ? "…" : "Buscar código"}
                </button>
              </div>
            </div>
            <div className="crm-scroll min-h-0 flex-1 overflow-y-auto p-4">
              {quotes.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">
                  No hay cotizaciones que coincidan
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {quotes.map((quote) => (
                    <button
                      key={quote.id}
                      type="button"
                      onClick={() => onSelectSource(quote)}
                      className="rounded-xl border border-border bg-surface p-4 text-left transition hover:border-primary hover:bg-primary-soft/40"
                    >
                      <p className="text-sm font-semibold text-foreground">
                        {quoteLabel(quote)}
                      </p>
                      <p className="mt-1 text-xs text-muted-strong">
                        {formatEntityCode(quote.project.publicCode)} ·{" "}
                        {clientFullName(quote.client)}
                      </p>
                      <p className="mt-2 text-sm font-medium tabular-nums text-foreground">
                        {formatClp(quote.totalNeto)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {mode === "clone" && sourceQuote ? (
              <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-muted/60 px-5 py-3">
                <p className="text-sm text-muted-strong">
                  Origen:{" "}
                  <span className="font-medium text-foreground">
                    {quoteLabel(sourceQuote)}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={onClearSource}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Cambiar origen
                </button>
              </div>
            ) : null}
            <div className="border-b border-border px-5 py-3">
              <input
                value={projectQuery}
                onChange={(e) => onProjectQuery(e.target.value)}
                placeholder="Buscar proyecto por código, cliente o dirección…"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                autoFocus
              />
            </div>
            <div className="crm-scroll min-h-0 flex-1 overflow-y-auto p-4">
              <ProjectCardGrid
                projects={projects}
                selectedId={selectedId}
                onSelect={onSelectProject}
              />
            </div>
          </>
        )}

        {error ? <p className="px-5 py-2 text-xs text-danger">{error}</p> : null}

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-full border border-border px-4 py-2 text-sm text-muted-strong hover:bg-hover"
          >
            Cancelar
          </button>
          {!choosingSource ? (
            <button
              type="button"
              disabled={
                busy || !selectedId || (mode === "clone" && !sourceQuote)
              }
              onClick={onSubmit}
              className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc] disabled:opacity-60"
            >
              {busy
                ? mode === "clone"
                  ? "Clonando…"
                  : "Creando…"
                : mode === "clone"
                  ? "Clonar cotización"
                  : "Crear cotización"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ProjectCardGrid({
  projects,
  selectedId,
  onSelect,
}: {
  projects: CotizadorProjectOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (projects.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted">
        No hay proyectos que coincidan
      </p>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {projects.map((project) => {
        const active = selectedId === project.id;
        return (
          <button
            key={project.id}
            type="button"
            onClick={() => onSelect(project.id)}
            className={`rounded-xl border p-4 text-left transition ${
              active
                ? "border-primary bg-primary-soft/60 ring-1 ring-primary"
                : "border-border bg-surface hover:border-primary hover:bg-primary-soft/30"
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              {formatEntityCode(project.publicCode)}
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {project.clientName}
            </p>
            <p className="mt-1 line-clamp-2 text-xs text-muted">
              {project.title ?? "Sin título"}
              {project.address ? ` · ${project.address}` : ""}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3-3" />
    </svg>
  );
}
