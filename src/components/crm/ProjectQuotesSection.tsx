"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import type {
  ProjectWithRelations,
  Quote,
  QuoteCommercialStatus,
} from "@/lib/crm/types";
import { clientFullName } from "@/lib/crm/labels";
import { formatEntityCode } from "@/lib/crm/project-codes";
import { formatQuoteCodeLabel } from "@/lib/crm/quote-codes";
import { canDeleteQuote } from "@/lib/crm/quote-delete";
import {
  QUOTE_COMMERCIAL_STATUS_LABELS,
  quoteCommercialStatusClass,
} from "@/lib/crm/quote-commercial-status";
import {
  QuoteActionIconRow,
  QuoteCloneIconButton,
  QuoteDeleteIconButton,
  QuoteEditIconButton,
  QuotePreviewIconButton,
} from "@/components/crm/QuoteRowActions";

const TZ = "America/Santiago";

export function ProjectQuotesSection({
  projectId,
  quotes: initialQuotes,
}: {
  projectId: string;
  quotes: Quote[];
}) {
  const router = useRouter();
  const [quotes, setQuotes] = useState(initialQuotes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [cloneTargetId, setCloneTargetId] = useState(projectId);
  const [projects, setProjects] = useState<ProjectWithRelations[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  useEffect(() => {
    setQuotes(initialQuotes);
  }, [initialQuotes]);

  useEffect(() => {
    if (!cloningId) return;
    let cancelled = false;
    setProjectsLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/projects");
        const data = (await res.json()) as {
          projects?: ProjectWithRelations[];
        };
        if (!cancelled) {
          setProjects(data.projects ?? []);
          setCloneTargetId(projectId);
        }
      } catch {
        if (!cancelled) setError("No se pudieron cargar los proyectos");
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cloningId, projectId]);

  const projectOptions = useMemo(
    () =>
      [...projects].sort((a, b) =>
        formatEntityCode(a.publicCode).localeCompare(
          formatEntityCode(b.publicCode),
          "es",
        ),
      ),
    [projects],
  );

  function quoteLabel(quote: Quote) {
    if (quote.quoteCode) return formatQuoteCodeLabel(quote.quoteCode);
    return quote.title;
  }

  async function createQuote() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { quote?: Quote; error?: string };
      if (!res.ok || !data.quote) {
        setError(data.error ?? "No se pudo crear la cotización");
        return;
      }
      router.push(
        `/proyectos/${projectId}/cotizador/${data.quote.id}?from=proyecto`,
      );
    } catch {
      setError("Error de red al crear la cotización");
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
        setBusy(false);
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
      const data = (await res.json()) as {
        quote?: Quote;
        error?: string;
      };
      if (!res.ok || !data.quote) {
        setError(data.error ?? "No se pudo clonar la cotización");
        setBusy(false);
        return;
      }
      setCloningId(null);
      router.push(
        `/proyectos/${cloneTargetId}/cotizador/${data.quote.id}?from=proyecto`,
      );
    } catch {
      setError("Error de red al clonar la cotización");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h3 className="text-sm font-medium text-foreground">Cotizaciones</h3>
          <p className="text-xs text-muted">
            Costos del proyecto · estado comercial (semáforo) · PDF a Drive
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void createQuote()}
          className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc] disabled:opacity-60"
        >
          {busy ? "Creando…" : "Nueva cotización"}
        </button>
      </div>

      {error ? (
        <p className="px-5 pt-3 text-sm text-danger">{error}</p>
      ) : null}

      {quotes.length === 0 ? (
        <p className="px-5 py-8 text-sm text-muted">Sin cotizaciones aún</p>
      ) : (
        <ul className="divide-y divide-border">
          {quotes.map((quote) => {
            const deletable = canDeleteQuote(quote.createdAt);
            const status = quote.commercialStatus ?? "NONE";
            return (
              <li
                key={quote.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div>
                  <Link
                    href={`/proyectos/${projectId}/cotizador/${quote.id}?from=proyecto`}
                    className="font-medium text-foreground hover:text-primary"
                  >
                    {quoteLabel(quote)}
                  </Link>
                  <p className="text-xs text-muted">
                    {quote.status === "FINAL" ? "Final" : "Borrador"} ·{" "}
                    {formatInTimeZone(
                      new Date(quote.updatedAt),
                      TZ,
                      "dd/MM/yyyy HH:mm",
                    )}
                  </p>
                  <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>Estado comercial</span>
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
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <QuoteActionIconRow>
                    <QuotePreviewIconButton
                      href={`/proyectos/${projectId}/cotizador/${quote.id}/preview?from=proyecto`}
                    />
                    <QuoteEditIconButton
                      href={`/proyectos/${projectId}/cotizador/${quote.id}?from=proyecto`}
                    />
                    <QuoteCloneIconButton
                      onClick={() => {
                        setError(null);
                        setCloningId(quote.id);
                      }}
                    />
                    {deletable ? (
                      <QuoteDeleteIconButton
                        onClick={() => setDeletingId(quote.id)}
                      />
                    ) : null}
                  </QuoteActionIconRow>
                </div>
              </li>
            );
          })}
        </ul>
      )}

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
              Eliminar cotización
            </h4>
            <p className="mb-4 text-sm text-muted-strong">
              ¿Seguro que quieres eliminar esta cotización? Solo es posible
              dentro de las primeras 48 horas. El código no se reutiliza.
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
                disabled={busy}
                onClick={() => void confirmDelete()}
                className="rounded-full bg-danger px-4 py-2 text-sm font-medium text-white"
              >
                Eliminar
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
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h4 className="mb-2 text-base font-semibold text-foreground">
              Clonar cotización
            </h4>
            <p className="mb-4 text-sm text-muted-strong">
              Se copia ítems, porcentajes y observaciones. El código se genera
              nuevo según el proyecto destino.
            </p>
            <label className="mb-1 block text-xs font-medium text-muted">
              Proyecto destino
            </label>
            {projectsLoading ? (
              <p className="mb-4 text-sm text-muted">Cargando proyectos…</p>
            ) : (
              <select
                value={cloneTargetId}
                onChange={(e) => setCloneTargetId(e.target.value)}
                className="mb-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              >
                {projectOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatEntityCode(p.publicCode)} · {clientFullName(p.client)}
                    {p.id === projectId ? " (este proyecto)" : ""}
                  </option>
                ))}
              </select>
            )}
            <div className="flex justify-end gap-2">
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
                disabled={busy || projectsLoading || !cloneTargetId}
                onClick={() => void confirmClone()}
                className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy ? "Clonando…" : "Clonar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
