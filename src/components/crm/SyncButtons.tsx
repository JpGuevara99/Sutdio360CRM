"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const AUTO_SYNC_MS = 60_000;

export function SyncButtons() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [autoEnabled, setAutoEnabled] = useState(true);
  const busyRef = useRef(false);

  const runCalendarSync = useCallback(
    async (silent = false) => {
      if (busyRef.current) return;
      busyRef.current = true;
      if (!silent) {
        setLoading(true);
        setMessage(null);
      }

      try {
        const res = await fetch("/api/sync/calendar?force=1", { method: "POST" });
        const data = (await res.json()) as Record<string, unknown>;
        const now = new Date();
        setLastSync(now);

        if (!res.ok) {
          if (!silent) {
            setMessage(String(data.error ?? "Error al sincronizar Calendar"));
          }
          return;
        }

        const created = Number(data.created ?? 0);
        const scanned = Number(data.scanned ?? 0);
        const skipped = Number(data.skipped ?? 0);
        const label = silent ? "Auto" : "Calendar";
        setMessage(
          `${label}: ${created} nuevos · ${scanned} leídos · ${skipped} omitidos · ${now.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}`,
        );

        if (created > 0 || !silent) {
          router.refresh();
        } else if (silent) {
          router.refresh();
        }
      } catch {
        if (!silent) setMessage("No se pudo sincronizar Calendar");
      } finally {
        busyRef.current = false;
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    if (!autoEnabled) return;

    void runCalendarSync(true);
    const id = window.setInterval(() => {
      void runCalendarSync(true);
    }, AUTO_SYNC_MS);

    return () => window.clearInterval(id);
  }, [autoEnabled, runCalendarSync]);

  async function runDriveRetry() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sync/drive/retry", { method: "POST" });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setMessage(String(data.error ?? "Error en Drive"));
      } else {
        setMessage(`Drive: reintentos ${String(data.retried ?? 0)}`);
        router.refresh();
      }
    } catch {
      setMessage("No se pudo reintentar Drive");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => void runCalendarSync(false)}
          className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc] disabled:opacity-60"
        >
          Sincronizar ahora
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void runDriveRetry()}
          className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-muted-strong hover:bg-surface-muted disabled:opacity-60"
        >
          Reintentar Drive
        </button>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={autoEnabled}
            onChange={(e) => setAutoEnabled(e.target.checked)}
            className="accent-[#1a73e8]"
          />
          Auto cada 1 min
        </label>
      </div>
      {message ? (
        <p className="max-w-3xl text-sm text-muted">{message}</p>
      ) : lastSync ? (
        <p className="text-sm text-muted">
          Última sync:{" "}
          {lastSync.toLocaleTimeString("es-CL", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      ) : null}
    </div>
  );
}
