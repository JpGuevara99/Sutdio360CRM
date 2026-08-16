"use client";

import { useEffect, useMemo, useState } from "react";
import { formatClp } from "@/lib/crm/labels";
import { formatEntityCode } from "@/lib/crm/project-codes";
import { formatQuoteCodeLabel } from "@/lib/crm/quote-codes";
import {
  QUOTE_COMMERCIAL_STATUS_LABELS,
  quoteCommercialStatusClass,
} from "@/lib/crm/quote-commercial-status";
import type {
  ProjectClosingOutcome,
  Quote,
  QuoteCommercialStatus,
} from "@/lib/crm/types";

type QuoteRow = Quote & {
  totalNeto?: number;
  includeIva?: boolean;
  totalConIva?: number;
};

function todayInputValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Punto de color del semáforo comercial de la cotización. */
function statusDotClass(status: QuoteCommercialStatus) {
  switch (status) {
    case "ACCEPTED":
      return "bg-[#137333]";
    case "REJECTED":
      return "bg-[#c5221f]";
    case "SENT":
      return "bg-[#b06000]";
    default:
      return "bg-neutral-400";
  }
}

export function ProjectClosePanel({
  projectId,
  publicCode,
  clientName,
  onCancel,
  onClosed,
}: {
  projectId: string;
  publicCode: string;
  clientName: string;
  /** El usuario descarta el cierre: la tarjeta vuelve a su etapa anterior */
  onCancel: () => void;
  onClosed: (result: {
    outcome: ProjectClosingOutcome;
    closedAt: string;
    amount: number | null;
  }) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [outcome, setOutcome] = useState<ProjectClosingOutcome>("APROBADO");
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [closedAt, setClosedAt] = useState(todayInputValue());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/quotes?withTotals=1`,
        );
        const data = (await res.json()) as { quotes?: QuoteRow[] };
        if (cancelled) return;
        const list = data.quotes ?? [];
        setQuotes(list);
        const preferred =
          list.find((q) => q.commercialStatus === "ACCEPTED") ??
          list.find((q) => q.commercialStatus === "SENT") ??
          list[0];
        if (preferred) {
          setQuoteId(preferred.id);
          setAmount(String(preferred.totalNeto ?? ""));
        }
      } catch {
        if (!cancelled) setError("No se pudieron cargar las cotizaciones");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const selectedQuote = useMemo(
    () => quotes.find((q) => q.id === quoteId) ?? null,
    [quotes, quoteId],
  );

  function selectQuote(quote: QuoteRow) {
    setQuoteId(quote.id);
    if (!amountTouched) {
      setAmount(String(quote.totalNeto ?? ""));
    }
  }

  async function submit() {
    if (busy) return;
    const parsedAmount = amount.trim() ? Number(amount.replace(/\./g, "")) : null;
    if (parsedAmount != null && !Number.isFinite(parsedAmount)) {
      setError("El monto no es válido");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome,
          quoteId,
          amount: parsedAmount,
          closedAt,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "No se pudo cerrar el proyecto");
        return;
      }
      onClosed({ outcome, closedAt, amount: parsedAmount });
    } catch {
      setError("Error de red al cerrar el proyecto");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/25"
        onClick={() => !busy && onCancel()}
        aria-hidden
      />
      <aside className="crm-slide-in-left fixed inset-y-0 left-0 z-[65] flex w-full max-w-md flex-col border-r border-border bg-surface shadow-2xl">
        <header className="border-b border-border px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Cierre de proyecto
          </p>
          <h2 className="truncate text-lg font-semibold text-foreground">
            {formatEntityCode(publicCode)} · {clientName}
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Confirma la conclusión, el monto y la fecha de finalización.
          </p>
        </header>

        <div className="crm-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section className="space-y-2">
            <p className="text-sm font-medium text-muted-strong">
              Conclusión del proyecto
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(["APROBADO", "RECHAZADO"] as ProjectClosingOutcome[]).map(
                (option) => {
                  const active = outcome === option;
                  const approved = option === "APROBADO";
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setOutcome(option)}
                      className={`rounded-xl border px-3 py-3 text-left transition ${
                        active
                          ? approved
                            ? "border-[#137333] bg-[#e6f4ea] ring-1 ring-[#137333]"
                            : "border-danger-border bg-danger-soft ring-1 ring-danger-border"
                          : "border-border bg-surface hover:border-primary"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            approved ? "bg-[#137333]" : "bg-[#c5221f]"
                          }`}
                        />
                        <span className="text-sm font-semibold text-foreground">
                          {approved ? "Aprobado" : "Rechazado"}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs text-muted">
                        {approved
                          ? "Se concretó la compra"
                          : "No se concretó"}
                      </span>
                    </button>
                  );
                },
              )}
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-sm font-medium text-muted-strong">
              Cotización con la que se concreta
            </p>
            {loading ? (
              <p className="text-sm text-muted">Cargando cotizaciones…</p>
            ) : quotes.length === 0 ? (
              <p className="rounded-lg border border-border px-3 py-3 text-sm text-muted">
                Este proyecto no tiene cotizaciones. Puedes cerrarlo igual e
                ingresar el monto a mano.
              </p>
            ) : (
              <ul className="space-y-2">
                {quotes.map((quote) => {
                  const status = quote.commercialStatus ?? "NONE";
                  const active = quoteId === quote.id;
                  return (
                    <li key={quote.id}>
                      <button
                        type="button"
                        onClick={() => selectQuote(quote)}
                        className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                          active
                            ? "border-primary bg-primary-soft/60 ring-1 ring-primary"
                            : "border-border bg-surface hover:border-primary"
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass(status)}`}
                            />
                            <span className="truncate text-sm font-medium text-foreground">
                              {quote.quoteCode
                                ? formatQuoteCodeLabel(quote.quoteCode)
                                : quote.title}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                            {formatClp(quote.totalNeto ?? 0)}
                          </span>
                        </span>
                        <span className="mt-1 flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${quoteCommercialStatusClass(status)}`}
                          >
                            {QUOTE_COMMERCIAL_STATUS_LABELS[status]}
                          </span>
                          {quote.includeIva ? (
                            <span className="text-[11px] tabular-nums text-muted">
                              + IVA {formatClp(quote.totalConIva ?? 0)}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {quoteId ? (
              <button
                type="button"
                onClick={() => setQuoteId(null)}
                className="text-xs font-medium text-primary hover:underline"
              >
                Cerrar sin cotización asociada
              </button>
            ) : null}
          </section>

          <section className="space-y-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-muted-strong">
                Monto confirmado
              </span>
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => {
                  setAmountTouched(true);
                  setAmount(e.target.value.replace(/[^\d]/g, ""));
                }}
                placeholder="0"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm tabular-nums text-foreground outline-none focus:border-primary"
              />
            </label>
            <p className="text-xs text-muted">
              {amount ? formatClp(Number(amount)) : "Sin monto"}
              {selectedQuote?.totalNeto != null
                ? ` · Total neto de la cotización: ${formatClp(selectedQuote.totalNeto)}`
                : ""}
            </p>
          </section>

          <section>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-muted-strong">
                Fecha de finalización
              </span>
              <input
                type="date"
                value={closedAt}
                onChange={(e) => setClosedAt(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            </label>
            <p className="mt-1 text-xs text-muted">
              La tarjeta permanece visible en Cerrado por 45 días desde esta
              fecha; después sigue disponible en la ficha del proyecto.
            </p>
          </section>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-full border border-border px-4 py-2 text-sm text-muted-strong hover:bg-hover"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc] disabled:opacity-60"
          >
            {busy ? "Cerrando…" : "Confirmar cierre"}
          </button>
        </div>
      </aside>
    </>
  );
}
