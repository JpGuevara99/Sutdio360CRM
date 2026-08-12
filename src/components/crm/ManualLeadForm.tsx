"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SOURCES = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "PHONE", label: "Llamada" },
  { value: "MANUAL", label: "Manual" },
] as const;

export function ManualLeadForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const scheduledLocal = String(form.get("scheduledAt"));
    const scheduledAt = new Date(scheduledLocal).toISOString();

    const payload = {
      firstName: String(form.get("firstName")),
      lastName: String(form.get("lastName")),
      email: String(form.get("email") || "") || null,
      phone: String(form.get("phone") || "") || null,
      address: String(form.get("address") || "") || null,
      scheduledAt,
      source: String(form.get("source")),
      notes: String(form.get("notes") || "") || null,
    };

    const res = await fetch("/api/leads/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as {
      error?: string;
      project?: { id: string };
    };

    setLoading(false);

    if (!res.ok || !data.project) {
      setError(data.error ?? "No se pudo crear el lead");
      return;
    }

    router.push(`/proyectos/${data.project.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Nombre</span>
          <input
            name="firstName"
            required
            className="w-full rounded border border-border px-3 py-2 outline-none focus:border-[#1a73e8]"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Apellido</span>
          <input
            name="lastName"
            required
            className="w-full rounded border border-border px-3 py-2 outline-none focus:border-[#1a73e8]"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Email</span>
          <input
            name="email"
            type="email"
            className="w-full rounded border border-border px-3 py-2 outline-none focus:border-[#1a73e8]"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Teléfono</span>
          <input
            name="phone"
            className="w-full rounded border border-border px-3 py-2 outline-none focus:border-[#1a73e8]"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-muted">Dirección</span>
        <input
          name="address"
          className="w-full rounded border border-border px-3 py-2 outline-none focus:border-[#1a73e8]"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Fecha y hora visita</span>
          <input
            name="scheduledAt"
            type="datetime-local"
            required
            className="w-full rounded border border-border px-3 py-2 outline-none focus:border-[#1a73e8]"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Origen</span>
          <select
            name="source"
            defaultValue="WHATSAPP"
            className="w-full rounded border border-border px-3 py-2 outline-none focus:border-[#1a73e8]"
          >
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-muted">Notas</span>
        <textarea
          name="notes"
          rows={3}
          className="w-full rounded border border-border px-3 py-2 outline-none focus:border-[#1a73e8]"
        />
      </label>

      {error ? <p className="text-sm text-[#d93025]">{error}</p> : null}

      <button
        type="submit"
        disabled={loading}
        className="rounded-full bg-[#1a73e8] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1765cc] disabled:opacity-60"
      >
        {loading ? "Guardando…" : "Crear proyecto RESERVADO"}
      </button>
    </form>
  );
}
