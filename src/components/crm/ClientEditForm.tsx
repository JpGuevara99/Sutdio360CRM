"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatEntityCode } from "@/lib/crm/project-codes";
import type { Client } from "@/lib/crm/types";

export function ClientEditForm({ client }: { client: Client }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: client.firstName,
    lastName: client.lastName,
    email: client.email ?? "",
    phone: client.phone ?? "",
    address: client.address ?? "",
  });

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        address: form.address,
      }),
    });

    const data = (await res.json()) as { error?: string };
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "No se pudo guardar");
      return;
    }

    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="space-y-3">
        <dl className="space-y-2 text-sm">
          <Row label="Cliente" value={formatEntityCode(client.leadCode)} />
          <Row
            label="Nombre"
            value={`${client.firstName} ${client.lastName}`.trim()}
          />
          <Row label="Email" value={client.email ?? "—"} />
          <Row label="Teléfono" value={client.phone ?? "—"} />
          <Row label="Dirección" value={client.address ?? "—"} />
        </dl>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-full border border-border px-3 py-1.5 text-sm text-primary hover:bg-primary-soft"
        >
          Editar cliente
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSave} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Nombre"
          value={form.firstName}
          onChange={(v) => setForm((f) => ({ ...f, firstName: v }))}
          required
        />
        <Field
          label="Apellido"
          value={form.lastName}
          onChange={(v) => setForm((f) => ({ ...f, lastName: v }))}
        />
        <Field
          label="Email"
          type="email"
          value={form.email}
          onChange={(v) => setForm((f) => ({ ...f, email: v }))}
        />
        <Field
          label="Teléfono"
          value={form.phone}
          onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
        />
      </div>
      <Field
        label="Dirección"
        value={form.address}
        onChange={(v) => setForm((f) => ({ ...f, address: v }))}
      />
      {error ? <p className="text-sm text-[#d93025]">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-[#1a73e8] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#1765cc] disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            setEditing(false);
            setError(null);
            setForm({
              firstName: client.firstName,
              lastName: client.lastName,
              email: client.email ?? "",
              phone: client.phone ?? "",
              address: client.address ?? "",
            });
          }}
          className="rounded-full border border-border px-4 py-1.5 text-sm text-muted-strong hover:bg-surface-muted"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-border px-3 py-2 outline-none focus:border-[#1a73e8]"
      />
    </label>
  );
}
