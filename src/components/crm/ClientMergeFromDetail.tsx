"use client";

import { useEffect, useState } from "react";
import { ClientMergeWizard } from "@/components/crm/ClientMergeWizard";
import type { ClientWithProjects } from "@/lib/crm/types";

export function ClientMergeFromDetail({
  currentClientId,
}: {
  currentClientId: string;
}) {
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<ClientWithProjects[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch("/api/clients");
        const data = (await res.json()) as {
          clients?: ClientWithProjects[];
        };
        if (!cancelled) setClients(data.clients ?? []);
      } catch {
        if (!cancelled) setError("No se pudieron cargar los clientes");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-strong hover:bg-hover"
      >
        Combinar clientes
      </button>

      {open && loading ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-surface p-5 text-center shadow-xl">
            <p className="text-sm text-muted">Cargando clientes…</p>
          </div>
        </div>
      ) : null}

      {open && error && !loading ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-xl">
            <p className="text-sm text-danger">{error}</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-border px-4 py-2 text-sm"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {open && !loading && !error ? (
        <ClientMergeWizard
          clients={clients}
          preselectedId={currentClientId}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
