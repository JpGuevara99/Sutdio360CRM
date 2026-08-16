"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  FOLLOW_UP_LIMIT,
  FOLLOW_UP_MAX_DAYS,
} from "@/lib/crm/follow-ups";
import type { FollowUpSettings } from "@/lib/crm/types";

export function FollowUpSettingsModal({
  settings,
  onClose,
  onSaved,
}: {
  settings: FollowUpSettings;
  onClose: () => void;
  onSaved: (settings: FollowUpSettings) => void;
}) {
  const router = useRouter();
  const [count, setCount] = useState(settings.count);
  const [days, setDays] = useState<string[]>(() => {
    const base = [...settings.intervalDays];
    while (base.length < FOLLOW_UP_LIMIT) {
      base.push(base[base.length - 1] ?? 7);
    }
    return base.map(String);
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testOk, setTestOk] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const intervalDays = days
        .slice(0, count)
        .map((value) => Math.floor(Number(value)));
      if (intervalDays.some((n) => !Number.isFinite(n) || n < 1)) {
        setError("Los días de espera deben ser números mayores a 0");
        return;
      }
      const res = await fetch("/api/settings/follow-ups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, intervalDays }),
      });
      const data = (await res.json()) as {
        settings?: FollowUpSettings;
        error?: string;
      };
      if (!res.ok || !data.settings) {
        setError(data.error ?? "No se pudo guardar la configuración");
        return;
      }
      onSaved(data.settings);
      setMessage("Configuración guardada");
      router.refresh();
    } catch {
      setError("Error de red al guardar");
    } finally {
      setBusy(false);
    }
  }

  async function testTasks() {
    setTesting(true);
    setTestResult(null);
    setTestOk(false);
    try {
      const res = await fetch("/api/settings/follow-ups/test-task", {
        method: "POST",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        listTitle?: string | null;
        listId?: string | null;
        lists?: number;
        error?: string | null;
      };
      if (data.ok) {
        setTestOk(true);
        setTestResult(
          `Conexión correcta. Lista: ${data.listTitle ?? data.listId ?? "—"} (${data.lists ?? 0} listas disponibles). Se creó y borró una tarea de prueba.`,
        );
      } else {
        setTestResult(data.error ?? "No se pudo crear la tarea de prueba");
      }
    } catch {
      setTestResult("Error de red al probar Google Tasks");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/35"
        aria-label="Cerrar"
        onClick={() => !busy && onClose()}
      />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold text-foreground">
            Configurar seguimientos
          </h3>
          <p className="text-xs text-muted">
            Cantidad de seguimientos y días de espera antes de cada uno. Cada
            seguimiento crea una tarea en Google Tasks con el link de WhatsApp
            del cliente.
          </p>
        </div>

        <div className="crm-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-muted-strong">
              Cantidad de seguimientos
            </span>
            <select
              value={count}
              disabled={busy}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            >
              {Array.from({ length: FOLLOW_UP_LIMIT }, (_, i) => i + 1).map(
                (n) => (
                  <option key={n} value={n}>
                    {n} seguimiento{n === 1 ? "" : "s"}
                  </option>
                ),
              )}
            </select>
          </label>

          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-strong">
              Días de espera
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: count }, (_, i) => i).map((index) => (
                <label
                  key={index}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span className="text-muted-strong">
                    Seguimiento #{index + 1}
                  </span>
                  <span className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      max={FOLLOW_UP_MAX_DAYS}
                      value={days[index] ?? ""}
                      disabled={busy}
                      onChange={(e) =>
                        setDays((prev) => {
                          const next = [...prev];
                          next[index] = e.target.value;
                          return next;
                        })
                      }
                      className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-primary"
                    />
                    <span className="text-xs text-muted">días</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted">
              El primer plazo se cuenta desde “Comenzar seguimiento”; los
              siguientes, desde que se cumple el anterior.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-surface-muted/50 px-3 py-3">
            <p className="text-sm font-medium text-foreground">Google Tasks</p>
            <p className="mt-1 text-xs text-muted">
              Prueba la conexión creando (y borrando) una tarea real.
            </p>
            <button
              type="button"
              disabled={testing}
              onClick={() => void testTasks()}
              className="mt-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-hover disabled:opacity-60"
            >
              {testing ? "Probando…" : "Probar Google Tasks"}
            </button>
            {testResult ? (
              <p
                className={`mt-2 text-xs leading-relaxed ${testOk ? "text-[#137333]" : "text-danger"}`}
              >
                {testResult}
              </p>
            ) : null}
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {message ? (
            <p className="text-sm text-[#137333]">{message}</p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-full border border-border px-4 py-2 text-sm text-muted-strong hover:bg-hover"
          >
            Cerrar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc] disabled:opacity-60"
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
