"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Botón "+ Nuevo cliente": crea el cliente con su código y carpeta en Drive. */
export function NewClientButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: String(form.get("firstName") || "").trim(),
          lastName: String(form.get("lastName") || "").trim(),
          email: String(form.get("email") || "").trim() || null,
          phone: String(form.get("phone") || "").trim() || null,
          address: String(form.get("address") || "").trim() || null,
        }),
      });
      const data = (await res.json()) as {
        client?: { id: string };
        error?: string;
        warning?: string;
      };
      if (!res.ok || !data.client) {
        setError(data.error ?? "No se pudo crear el cliente");
        setBusy(false);
        return;
      }
      if (data.warning) {
        setError(data.warning);
      }
      setOpen(false);
      setBusy(false);
      router.push(`/clientes/${data.client.id}`);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="rounded-full bg-[#1a73e8] px-4 py-1.5 text-sm font-medium text-white transition hover:bg-[#1765cc]"
      >
        + Nuevo cliente
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-black/35"
            onClick={() => !busy && setOpen(false)}
          />
          <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold text-foreground">
                Nuevo cliente
              </h3>
              <p className="text-xs text-muted">
                Se le asigna un código C-xx y su carpeta en Drive
              </p>
            </div>
            <form onSubmit={onSubmit} className="space-y-4 px-5 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nombre" name="firstName" required />
                <Field label="Apellido" name="lastName" />
                <Field
                  label="Teléfono"
                  name="phone"
                  placeholder="+56 9 1234 5678"
                />
                <Field label="Email" name="email" type="email" />
                <div className="sm:col-span-2">
                  <Field label="Dirección" name="address" />
                </div>
              </div>

              {error ? (
                <p className="text-sm text-[#d93025]">{error}</p>
              ) : null}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="rounded-full border border-border px-4 py-2 text-sm text-muted-strong transition hover:bg-hover disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-full bg-[#1a73e8] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#1765cc] disabled:opacity-60"
                >
                  {busy ? "Creando…" : "Crear cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
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
