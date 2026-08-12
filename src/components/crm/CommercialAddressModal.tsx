"use client";

import { useMemo, useState } from "react";
import {
  CHILE_REGIONS,
  communesForRegion,
  emptyChileAddress,
  formatChileAddress,
} from "@/lib/crm/chile-address";
import type { ChileAddress, CompanySettings } from "@/lib/crm/types";

const fieldClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

export function CommercialAddressModal({
  initialSettings,
  onClose,
  onSaved,
}: {
  initialSettings: Pick<CompanySettings, "commercialAddress" | "phone">;
  onClose: () => void;
  onSaved: (settings: Pick<CompanySettings, "commercialAddress" | "phone">) => void;
}) {
  const [form, setForm] = useState<ChileAddress>(
    initialSettings.commercialAddress ?? emptyChileAddress(),
  );
  const [phone, setPhone] = useState(initialSettings.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const communes = useMemo(
    () => communesForRegion(form.region),
    [form.region],
  );
  const preview = formatChileAddress(form);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commercialAddress: form,
          phone: phone.trim() || null,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        settings?: Pick<CompanySettings, "commercialAddress" | "phone">;
      };
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar la información");
        return;
      }
      onSaved({
        commercialAddress: data.settings?.commercialAddress ?? form,
        phone: data.settings?.phone ?? (phone.trim() || null),
      });
      onClose();
    } catch {
      setError("Error de red al guardar la información");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/35"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <form
        onSubmit={onSubmit}
        className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-surface shadow-xl"
      >
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold text-foreground">
            Información comercial
          </h3>
          <p className="mt-1 text-xs text-muted">
            Dirección y teléfono que aparecen en la cotización final y se
            reutilizan más adelante.
          </p>
        </div>

        <div className="space-y-3 px-5 py-4">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Teléfono comercial</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ej. (+56) 9 8991 1218"
              className={fieldClass}
              autoFocus
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-muted">Calle / Avenida</span>
              <input
                required
                value={form.street}
                onChange={(e) =>
                  setForm((f) => ({ ...f, street: e.target.value }))
                }
                placeholder="Ej. Av. Providencia"
                className={fieldClass}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Número</span>
              <input
                required
                value={form.number}
                onChange={(e) =>
                  setForm((f) => ({ ...f, number: e.target.value }))
                }
                placeholder="Ej. 2124"
                className={fieldClass}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">
                Depto / Oficina (opcional)
              </span>
              <input
                value={form.complement}
                onChange={(e) =>
                  setForm((f) => ({ ...f, complement: e.target.value }))
                }
                placeholder="Ej. Of. 501"
                className={fieldClass}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Región</span>
              <select
                required
                value={form.region}
                onChange={(e) => {
                  const region = e.target.value;
                  setForm((f) => ({
                    ...f,
                    region,
                    commune: communesForRegion(region).includes(f.commune)
                      ? f.commune
                      : "",
                  }));
                }}
                className={fieldClass}
              >
                <option value="">Selecciona región</option>
                {CHILE_REGIONS.map((region) => (
                  <option key={region.id} value={region.name}>
                    {region.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Comuna</span>
              <select
                required
                value={form.commune}
                disabled={!form.region}
                onChange={(e) =>
                  setForm((f) => ({ ...f, commune: e.target.value }))
                }
                className={`${fieldClass} disabled:opacity-60`}
              >
                <option value="">
                  {form.region ? "Selecciona comuna" : "Elige una región"}
                </option>
                {communes.map((commune) => (
                  <option key={commune} value={commune}>
                    {commune}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {preview ? (
            <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-muted-strong">
              {preview}
              {phone.trim() ? ` · ${phone.trim()}` : ""}
            </p>
          ) : null}

          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-full border border-border px-4 py-2 text-sm text-muted-strong hover:bg-hover"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc] disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
