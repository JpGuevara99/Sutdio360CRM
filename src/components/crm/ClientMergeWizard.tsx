"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClientMergePreviewModal } from "@/components/crm/ClientMergePreviewModal";
import { clientFullName } from "@/lib/crm/labels";
import type { ClientMergePreview } from "@/lib/crm/merge-clients-types";
import { formatEntityCode } from "@/lib/crm/project-codes";
import type { ClientWithProjects } from "@/lib/crm/types";

type Step = "first" | "second";

export function ClientMergeWizard({
  clients,
  preselectedId,
  onClose,
}: {
  clients: ClientWithProjects[];
  preselectedId?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const initialFirst =
    preselectedId && clients.some((c) => c.id === preselectedId)
      ? preselectedId
      : null;
  const [step, setStep] = useState<Step>(initialFirst ? "second" : "first");
  const [firstId, setFirstId] = useState<string | null>(initialFirst);
  const [secondId, setSecondId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<ClientMergePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstClient = clients.find((c) => c.id === firstId) ?? null;

  const candidates = useMemo(() => {
    const excludeId = step === "second" ? firstId : null;
    const q = query.trim().toLowerCase();
    return clients.filter((client) => {
      if (excludeId && client.id === excludeId) return false;
      if (!q) return true;
      const hay = [
        client.leadCode,
        formatEntityCode(client.leadCode),
        clientFullName(client),
        client.phone ?? "",
        client.email ?? "",
        client.address ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [clients, firstId, query, step]);

  async function openPreview(clientA: string, clientB: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/clients/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preview: true,
          clientIds: [clientA, clientB],
        }),
      });
      const data = (await res.json()) as {
        preview?: ClientMergePreview;
        error?: string;
      };
      if (!res.ok || !data.preview) {
        setError(data.error ?? "No se pudo preparar la combinación");
        return;
      }
      setPreview(data.preview);
    } catch {
      setError("Error de red al preparar la combinación");
    } finally {
      setBusy(false);
    }
  }

  async function confirmMerge() {
    if (!preview || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/clients/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keeperId: preview.keeper.id,
          mergeIds: preview.mergeClients.map((c) => c.id),
        }),
      });
      const data = (await res.json()) as {
        client?: ClientWithProjects;
        error?: string;
      };
      if (!res.ok || !data.client) {
        setError(data.error ?? "No se pudieron combinar los clientes");
        setBusy(false);
        return;
      }
      setPreview(null);
      onClose();
      router.push(`/clientes/${data.client.id}`);
      router.refresh();
    } catch {
      setError("Error de red al combinar");
      setBusy(false);
    }
  }

  function selectClient(id: string) {
    setError(null);
    if (step === "first") {
      setFirstId(id);
      setSecondId(null);
      setQuery("");
      setStep("second");
      return;
    }
    setSecondId(id);
    void openPreview(firstId!, id);
  }

  return (
    <>
      {!preview ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Cerrar"
            onClick={() => !busy && onClose()}
          />
          <div className="relative z-10 flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold text-foreground">
                Combinar clientes
              </h3>
              <p className="text-xs text-muted">
                {step === "first"
                  ? "Elige el primer cliente"
                  : "Ahora elige el segundo cliente. Se conservará el más antiguo."}
              </p>
            </div>

            {step === "second" && firstClient ? (
              <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-muted/60 px-5 py-3">
                <p className="text-sm text-muted-strong">
                  Primero:{" "}
                  <span className="font-medium text-foreground">
                    {formatEntityCode(firstClient.leadCode)} ·{" "}
                    {clientFullName(firstClient)}
                  </span>
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setStep("first");
                    setFirstId(null);
                    setSecondId(null);
                    setQuery("");
                    setError(null);
                  }}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Cambiar
                </button>
              </div>
            ) : null}

            <div className="border-b border-border px-5 py-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por código, nombre, teléfono o email…"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                autoFocus
              />
            </div>

            <div className="crm-scroll min-h-0 flex-1 overflow-y-auto p-4">
              {busy ? (
                <p className="py-10 text-center text-sm text-muted">
                  Preparando combinación…
                </p>
              ) : (
                <ClientCardGrid
                  clients={candidates}
                  selectedId={step === "first" ? firstId : secondId}
                  onSelect={selectClient}
                />
              )}
            </div>

            {error ? (
              <p className="px-5 py-2 text-xs text-danger">{error}</p>
            ) : null}

            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="rounded-full border border-border px-4 py-2 text-sm text-muted-strong hover:bg-hover"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {preview ? (
        <ClientMergePreviewModal
          preview={preview}
          busy={busy}
          error={error}
          onClose={() => {
            if (busy) return;
            setPreview(null);
            setError(null);
            setSecondId(null);
          }}
          onConfirm={() => void confirmMerge()}
        />
      ) : null}
    </>
  );
}

function ClientCardGrid({
  clients,
  selectedId,
  onSelect,
}: {
  clients: ClientWithProjects[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (clients.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted">
        No hay clientes que coincidan
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {clients.map((client) => {
        const active = selectedId === client.id;
        return (
          <button
            key={client.id}
            type="button"
            onClick={() => onSelect(client.id)}
            className={`rounded-xl border p-4 text-left transition ${
              active
                ? "border-primary bg-primary-soft/60 ring-1 ring-primary"
                : "border-border bg-surface hover:border-primary hover:bg-primary-soft/30"
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              {formatEntityCode(client.leadCode)}
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {clientFullName(client)}
            </p>
            <p className="mt-1 text-xs text-muted-strong">
              {client.phone ?? "Sin teléfono"}
              {client.email ? ` · ${client.email}` : ""}
            </p>
            <p className="mt-1 line-clamp-2 text-xs text-muted">
              {client.address ?? "Sin dirección"} · {client.projectCount}{" "}
              proyecto{client.projectCount === 1 ? "" : "s"}
            </p>
          </button>
        );
      })}
    </div>
  );
}
