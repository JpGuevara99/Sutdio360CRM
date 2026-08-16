"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { formatQuoteCodeLabel } from "@/lib/crm/quote-codes";
import {
  QUOTE_COMMERCIAL_STATUS_LABELS,
  quoteCommercialStatusClass,
} from "@/lib/crm/quote-commercial-status";
import type { Quote } from "@/lib/crm/types";

const TZ = "America/Santiago";

type QuoteRow = Pick<
  Quote,
  "id" | "quoteCode" | "title" | "status" | "commercialStatus"
> & { updatedAt: string };

/** Cotizaciones del proyecto dentro del panel de la tarjeta. */
export function ProjectDrawerQuotes({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [quotes, setQuotes] = useState<QuoteRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/quotes`);
        const data = (await res.json()) as {
          quotes?: Array<Quote & { updatedAt: string | Date }>;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !data.quotes) {
          setError(data.error ?? "No se pudieron cargar las cotizaciones");
          setQuotes([]);
          return;
        }
        setQuotes(
          data.quotes.map((quote) => ({
            id: quote.id,
            quoteCode: quote.quoteCode,
            title: quote.title,
            status: quote.status,
            commercialStatus: quote.commercialStatus ?? "NONE",
            updatedAt:
              typeof quote.updatedAt === "string"
                ? quote.updatedAt
                : new Date(quote.updatedAt).toISOString(),
          })),
        );
      } catch {
        if (!cancelled) {
          setError("Error de red al cargar las cotizaciones");
          setQuotes([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

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
        setBusy(false);
        return;
      }
      router.push(
        `/proyectos/${projectId}/cotizador/${data.quote.id}?from=proyecto`,
      );
    } catch {
      setError("Error de red al crear la cotización");
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium text-foreground">Cotizaciones</h3>
        <button
          type="button"
          disabled={busy}
          onClick={() => void createQuote()}
          className="rounded-full bg-[#1a73e8] px-3 py-1 text-xs font-medium text-white transition hover:bg-[#1765cc] disabled:opacity-60"
        >
          {busy ? "Creando…" : "Nueva cotización"}
        </button>
      </div>

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      {!quotes ? (
        <p className="text-muted">Cargando cotizaciones…</p>
      ) : quotes.length === 0 ? (
        <p className="text-muted">Sin cotizaciones aún</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {quotes.map((quote) => (
            <li key={quote.id} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={`/proyectos/${projectId}/cotizador/${quote.id}?from=proyecto`}
                  className="min-w-0 truncate rounded-md font-medium text-foreground underline decoration-transparent underline-offset-[3px] transition hover:text-primary hover:decoration-primary"
                >
                  {quote.quoteCode
                    ? formatQuoteCodeLabel(quote.quoteCode)
                    : quote.title}
                </Link>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${quoteCommercialStatusClass(
                    quote.commercialStatus,
                  )}`}
                >
                  {QUOTE_COMMERCIAL_STATUS_LABELS[quote.commercialStatus]}
                </span>
              </div>
              <p className="text-xs text-muted">
                {quote.status === "FINAL" ? "Final" : "Borrador"} ·{" "}
                {formatInTimeZone(
                  new Date(quote.updatedAt),
                  TZ,
                  "dd/MM/yyyy HH:mm",
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
