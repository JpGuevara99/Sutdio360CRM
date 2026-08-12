"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import type { Quote } from "@/lib/crm/types";

const TZ = "America/Santiago";

export function ProjectQuotesSection({
  projectId,
  quotes,
}: {
  projectId: string;
  quotes: Quote[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  async function confirmDelete() {
    if (!deletingId) return;
    setBusy(true);
    const res = await fetch(`/api/quotes/${deletingId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError("No se pudo eliminar la cotización");
      return;
    }
    setDeletingId(null);
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h3 className="text-sm font-medium text-foreground">Cotizaciones</h3>
          <p className="text-xs text-muted">
            Costos del proyecto · vista HTML y PDF opcional a Drive
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
          {quotes.map((quote) => (
            <li
              key={quote.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
            >
              <div>
                <Link
                  href={`/proyectos/${projectId}/cotizador/${quote.id}?from=proyecto`}
                  className="font-medium text-foreground hover:text-primary"
                >
                  {quote.title}
                </Link>
                <p className="text-xs text-muted">
                  {quote.status === "FINAL" ? "Final" : "Borrador"} ·{" "}
                  {formatInTimeZone(
                    new Date(quote.updatedAt),
                    TZ,
                    "dd/MM/yyyy HH:mm",
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/proyectos/${projectId}/cotizador/${quote.id}/preview?from=proyecto`}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-strong hover:bg-hover"
                >
                  Vista previa
                </Link>
                <Link
                  href={`/proyectos/${projectId}/cotizador/${quote.id}?from=proyecto`}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-primary hover:bg-primary-soft"
                >
                  Editar
                </Link>
                <button
                  type="button"
                  onClick={() => setDeletingId(quote.id)}
                  className="rounded-full px-3 py-1.5 text-xs text-danger hover:underline"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
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
              ¿Seguro que quieres eliminar esta cotización? Esta acción no se
              puede deshacer.
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
    </section>
  );
}
