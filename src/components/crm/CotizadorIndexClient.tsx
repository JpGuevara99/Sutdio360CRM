"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { clientFullName } from "@/lib/crm/labels";
import { formatEntityCode } from "@/lib/crm/project-codes";
import { CommercialAddressModal } from "@/components/crm/CommercialAddressModal";
import type { CompanySettings, Quote, QuoteWithProject } from "@/lib/crm/types";

const TZ = "America/Santiago";

export type CotizadorProjectOption = {
  id: string;
  publicCode: string;
  title: string | null;
  clientName: string;
  address: string | null;
};

export function CotizadorIndexClient({
  quotes,
  projects,
  initialCompanySettings,
}: {
  quotes: QuoteWithProject[];
  projects: CotizadorProjectOption[];
  initialCompanySettings: Pick<CompanySettings, "commercialAddress" | "phone">;
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [companySettings, setCompanySettings] = useState(initialCompanySettings);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const hay = `${p.publicCode} ${p.clientName} ${p.title ?? ""} ${p.address ?? ""}`.toLowerCase();
      return hay.includes(q) || formatEntityCode(p.publicCode).toLowerCase().includes(q);
    });
  }, [projects, query]);

  async function createForProject() {
    if (!selectedId || busy) return;
    setBusy(true);
    setError(null);
    try {
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
      setError("Error de red al crear la cotización");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          Presupuestos de costos por proyecto. Crea una cotización nueva o abre
          una existente para editarla.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAddressOpen(true)}
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-muted"
          >
            Modificar información comercial
          </button>
          <button
            type="button"
            onClick={() => {
              setPickerOpen(true);
              setSelectedId(null);
              setQuery("");
              setError(null);
            }}
            className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc]"
          >
            + Nueva cotización
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface">
        {quotes.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            Aún no hay cotizaciones. Usa “+ Nueva cotización” para empezar.
          </p>
        ) : (
          <div className="crm-scroll min-h-0 flex-1 overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-surface-muted text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Cotización</th>
                <th className="px-4 py-3 font-medium">Proyecto</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Actualizado</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {quotes.map((quote) => (
                <tr key={quote.id} className="hover:bg-surface-muted">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{quote.title}</p>
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
                  <td className="px-4 py-3 text-muted">
                    {formatInTimeZone(
                      new Date(quote.updatedAt),
                      TZ,
                      "dd/MM/yyyy HH:mm",
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/proyectos/${quote.projectId}/cotizador/${quote.id}?from=cotizador`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Cerrar"
            onClick={() => setPickerOpen(false)}
          />
          <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border bg-surface shadow-xl">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold text-foreground">
                Nueva cotización
              </h3>
              <p className="text-xs text-muted">
                Elige el proyecto al que se asignará
              </p>
            </div>

            <div className="border-b border-border px-5 py-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por código, cliente o dirección…"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted">
                  No hay proyectos que coincidan
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {filtered.map((project) => {
                    const active = selectedId === project.id;
                    return (
                      <li key={project.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(project.id)}
                          className={`flex w-full flex-col items-start gap-0.5 px-5 py-3 text-left transition hover:bg-surface-muted ${
                            active ? "bg-primary-soft" : ""
                          }`}
                        >
                          <span className="text-sm font-medium text-foreground">
                            {formatEntityCode(project.publicCode)} ·{" "}
                            {project.clientName}
                          </span>
                          <span className="text-xs text-muted">
                            {project.title ?? "Sin título"}
                            {project.address ? ` · ${project.address}` : ""}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {error ? (
              <p className="px-5 py-2 text-xs text-danger">{error}</p>
            ) : null}

            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => setPickerOpen(false)}
                className="rounded-full border border-border px-4 py-2 text-sm text-muted-strong hover:bg-hover"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy || !selectedId}
                onClick={() => void createForProject()}
                className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc] disabled:opacity-60"
              >
                {busy ? "Creando…" : "Crear cotización"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
