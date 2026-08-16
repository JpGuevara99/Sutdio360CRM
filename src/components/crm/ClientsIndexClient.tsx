"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ClientMergeWizard } from "@/components/crm/ClientMergeWizard";
import { NewClientButton } from "@/components/crm/NewClientButton";
import { clientFullName } from "@/lib/crm/labels";
import { formatEntityCode } from "@/lib/crm/project-codes";
import type { ClientWithProjects } from "@/lib/crm/types";

export function ClientsIndexClient({
  clients,
  canMerge,
}: {
  clients: ClientWithProjects[];
  /** Combinar clientes es irreversible: solo ADMIN */
  canMerge: boolean;
}) {
  const [query, setQuery] = useState("");
  const [mergeOpen, setMergeOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((client) => {
      const hay = [
        client.leadCode,
        formatEntityCode(client.leadCode),
        client.firstName,
        client.lastName,
        clientFullName(client),
        client.phone ?? "",
        client.email ?? "",
        client.address ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [clients, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <label className="relative min-w-0 max-w-sm flex-1">
          <span className="sr-only">Buscar clientes</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por código, nombre, teléfono, email…"
            className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
        <NewClientButton />
        {canMerge ? (
          <button
            type="button"
            disabled={clients.length < 2}
            onClick={() => setMergeOpen(true)}
            className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-foreground transition hover:border-primary hover:bg-primary-soft/40 disabled:opacity-60"
          >
            Combinar clientes
          </button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface">
        <div className="crm-scroll min-h-0 flex-1 overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-surface-muted text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 font-medium">Dirección</th>
                <th className="px-4 py-3 font-medium">Proyectos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((client) => (
                <tr key={client.id} className="hover:bg-surface-muted">
                  <td className="px-4 py-3">
                    <Link
                      href={`/clientes/${client.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {formatEntityCode(client.leadCode)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/clientes/${client.id}`}
                      className="text-primary hover:underline"
                    >
                      {clientFullName(client)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-strong">
                    <div>{client.email ?? "—"}</div>
                    <div className="text-muted">{client.phone ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {client.address ?? "—"}
                  </td>
                  <td className="px-4 py-3">{client.projectCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {clients.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted">Aún no hay clientes.</p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted">
              No hay clientes que coincidan con la búsqueda.
            </p>
          ) : null}
        </div>
      </div>

      {mergeOpen ? (
        <ClientMergeWizard
          clients={clients}
          onClose={() => setMergeOpen(false)}
        />
      ) : null}
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
