"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clientFullName } from "@/lib/crm/labels";
import { formatEntityCode } from "@/lib/crm/project-codes";
import type { ClientWithProjects } from "@/lib/crm/types";

export type ProjectCreateMode = "new-client" | "existing-client";

const SOURCES = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "PHONE", label: "Llamada" },
  { value: "MANUAL", label: "Manual" },
] as const;

/**
 * Crea un proyecto manual: con cliente nuevo (código nuevo) o sobre un cliente
 * existente (mantiene su código). Se usa en la página de Nuevo Lead / Proyecto,
 * en el pipeline y en la ficha del cliente.
 */
export function ProjectCreateForm({
  initialMode = "new-client",
  lockedClient = null,
  onCancel,
  onCreated,
}: {
  initialMode?: ProjectCreateMode;
  /** Cliente fijo (ficha del cliente): no se puede cambiar */
  lockedClient?: { id: string; label: string } | null;
  onCancel?: () => void;
  onCreated?: (projectId: string) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<ProjectCreateMode>(
    lockedClient ? "existing-client" : initialMode,
  );
  const [clients, setClients] = useState<ClientWithProjects[] | null>(null);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    lockedClient?.id ?? null,
  );
  const [query, setQuery] = useState("");
  const [withVisit, setWithVisit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsClientList = mode === "existing-client" && !lockedClient;

  useEffect(() => {
    if (!needsClientList || clients) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/clients");
        const data = (await res.json()) as {
          clients?: ClientWithProjects[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !data.clients) {
          setClientsError(data.error ?? "No se pudieron cargar los clientes");
          return;
        }
        setClients(data.clients);
      } catch {
        if (!cancelled) setClientsError("Error de red al cargar clientes");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clients, needsClientList]);

  const candidates = useMemo(() => {
    if (!clients) return [];
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((client) =>
      [
        formatEntityCode(client.leadCode),
        clientFullName(client),
        client.phone ?? "",
        client.email ?? "",
        client.address ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [clients, query]);

  const selectedClient =
    clients?.find((c) => c.id === selectedClientId) ?? null;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = new FormData(event.currentTarget);

    if (mode === "existing-client" && !selectedClientId) {
      setError("Elige el cliente para el proyecto");
      return;
    }

    const scheduledLocal = String(form.get("scheduledAt") || "");
    if (withVisit && !scheduledLocal) {
      setError("Indica la fecha y hora de la visita");
      return;
    }

    setBusy(true);
    setError(null);

    const payload: Record<string, unknown> = {
      title: String(form.get("title") || "") || null,
      notes: String(form.get("notes") || "") || null,
    };

    if (mode === "existing-client") {
      payload.clientId = selectedClientId;
    } else {
      payload.client = {
        firstName: String(form.get("firstName") || "").trim(),
        lastName: String(form.get("lastName") || "").trim(),
        email: String(form.get("email") || "").trim() || null,
        phone: String(form.get("phone") || "").trim() || null,
        address: String(form.get("address") || "").trim() || null,
      };
    }

    if (withVisit && scheduledLocal) {
      payload.scheduledAt = new Date(scheduledLocal).toISOString();
      payload.source = String(form.get("source") || "MANUAL");
      const duration = Number(form.get("durationMin") || 60);
      payload.durationMin = Number.isFinite(duration) && duration > 0
        ? Math.floor(duration)
        : 60;
    }

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        project?: { id: string };
        error?: string;
      };
      if (!res.ok || !data.project) {
        setError(data.error ?? "No se pudo crear el proyecto");
        setBusy(false);
        return;
      }
      if (onCreated) {
        onCreated(data.project.id);
      } else {
        router.push(`/proyectos/${data.project.id}`);
      }
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {!lockedClient ? (
        <div className="inline-flex rounded-full border border-border bg-surface-muted p-1">
          {(
            [
              { value: "new-client", label: "Cliente nuevo" },
              { value: "existing-client", label: "Cliente existente" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setMode(option.value);
                setError(null);
              }}
              className={`rounded-full px-4 py-1.5 text-sm transition ${
                mode === option.value
                  ? "bg-surface font-medium text-foreground shadow-sm"
                  : "text-muted-strong hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      {lockedClient ? (
        <p className="rounded-lg border border-border bg-surface-muted/60 px-3 py-2 text-sm text-muted-strong">
          Cliente:{" "}
          <span className="font-medium text-foreground">
            {lockedClient.label}
          </span>{" "}
          — el proyecto se crea con su código existente
        </p>
      ) : mode === "existing-client" ? (
        <div className="space-y-3">
          {selectedClient ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary bg-primary-soft/40 px-3 py-2">
              <p className="text-sm text-foreground">
                <span className="font-medium">
                  {formatEntityCode(selectedClient.leadCode)}
                </span>{" "}
                · {clientFullName(selectedClient)}
              </p>
              <button
                type="button"
                onClick={() => setSelectedClientId(null)}
                className="text-xs font-medium text-primary hover:underline"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar cliente por código, nombre, teléfono o email…"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
              {clientsError ? (
                <p className="text-sm text-[#d93025]">{clientsError}</p>
              ) : !clients ? (
                <p className="py-6 text-center text-sm text-muted">
                  Cargando clientes…
                </p>
              ) : candidates.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">
                  No hay clientes que coincidan
                </p>
              ) : (
                <div className="crm-scroll grid max-h-64 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                  {candidates.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => setSelectedClientId(client.id)}
                      className="rounded-xl border border-border bg-surface p-3 text-left transition hover:border-primary hover:bg-primary-soft/30"
                    >
                      <p className="text-xs font-medium uppercase tracking-wide text-primary">
                        {formatEntityCode(client.leadCode)}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {clientFullName(client)}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted">
                        {client.phone ?? "Sin teléfono"}
                        {client.email ? ` · ${client.email}` : ""}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" name="firstName" required />
          <Field label="Apellido" name="lastName" />
          <Field label="Teléfono" name="phone" placeholder="+56 9 1234 5678" />
          <Field label="Email" name="email" type="email" />
          <div className="sm:col-span-2">
            <Field label="Dirección" name="address" />
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field
            label="Título del proyecto"
            name="title"
            placeholder="Ej. Cocina en cuarzo — Providencia"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-strong">
        <input
          type="checkbox"
          checked={withVisit}
          onChange={(e) => setWithVisit(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        Agendar visita técnica
      </label>

      {withVisit ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <Field label="Fecha y hora" name="scheduledAt" type="datetime-local" />
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Duración (min)</span>
            <input
              name="durationMin"
              type="number"
              min={15}
              step={15}
              defaultValue={60}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Origen</span>
            <select
              name="source"
              defaultValue="WHATSAPP"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {SOURCES.map((source) => (
                <option key={source.value} value={source.value}>
                  {source.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <label className="block text-sm">
        <span className="mb-1 block text-muted">Notas</span>
        <textarea
          name="notes"
          rows={3}
          placeholder="Detalles del requerimiento, medidas, referencias…"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </label>

      {error ? <p className="text-sm text-[#d93025]">{error}</p> : null}

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full border border-border px-4 py-2 text-sm text-muted-strong transition hover:bg-hover disabled:opacity-60"
          >
            Cancelar
          </button>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-[#1a73e8] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#1765cc] disabled:opacity-60"
        >
          {busy ? "Creando…" : "Crear proyecto"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}
