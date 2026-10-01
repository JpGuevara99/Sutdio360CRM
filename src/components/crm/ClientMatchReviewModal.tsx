"use client";

import { clientFullName } from "@/lib/crm/labels";
import { formatEntityCode } from "@/lib/crm/project-codes";
import type { Client, ClientMatchReason } from "@/lib/crm/types";

const REASON_LABEL: Record<ClientMatchReason, string> = {
  email: "Mismo correo",
  phone: "Mismo teléfono",
  email_and_phone: "Mismo correo y teléfono",
};

function ClientCard({
  title,
  client,
}: {
  title: string;
  client: Client;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-muted/60 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {title}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">
        {formatEntityCode(client.leadCode)} · {clientFullName(client)}
      </p>
      <dl className="mt-3 space-y-1 text-xs text-muted-strong">
        <div className="flex justify-between gap-3">
          <dt>Email</dt>
          <dd className="text-right">{client.email ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Teléfono</dt>
          <dd className="text-right">{client.phone ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Dirección</dt>
          <dd className="text-right">{client.address ?? "—"}</dd>
        </div>
      </dl>
    </div>
  );
}

export function ClientMatchReviewModal({
  newClient,
  existingClient,
  reason,
  remaining,
  busy,
  error,
  onMerge,
  onIndependent,
  onLater,
}: {
  newClient: Client;
  existingClient: Client;
  reason: ClientMatchReason;
  remaining: number;
  busy: boolean;
  error: string | null;
  onMerge: () => void;
  onIndependent: () => void;
  onLater: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-match-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
      >
        <div className="border-b border-border px-5 py-4">
          <h3
            id="client-match-title"
            className="text-base font-semibold text-foreground"
          >
            ¿Combinar estos clientes?
          </h3>
          <p className="mt-1 text-xs text-muted">
            {REASON_LABEL[reason]}. Puede ser la misma persona o un cliente
            distinto con datos parecidos.
          </p>
          {remaining > 1 ? (
            <p className="mt-1 text-xs text-muted">
              1 de {remaining} coincidencias pendientes
            </p>
          ) : null}
        </div>

        <div className="crm-scroll flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm">
          <p className="text-sm leading-relaxed text-muted-strong">
            El sistema ya no une fichas solo. Si los combinas, se conserva el
            cliente más antiguo y su dirección no se reemplaza. Si son
            independientes, quedan dos fichas.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <ClientCard title="Ficha existente" client={existingClient} />
            <ClientCard title="Alta reciente" client={newClient} />
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onLater}
            className="rounded-full border border-border px-4 py-2 text-sm disabled:opacity-60"
          >
            Ahora no
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onIndependent}
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {busy ? "Guardando…" : "Dejar independientes"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onMerge}
            className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? "Combinando…" : "Combinar"}
          </button>
        </div>
      </div>
    </div>
  );
}
