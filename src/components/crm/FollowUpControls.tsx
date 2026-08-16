"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import type { FollowUpAction } from "@/lib/crm/follow-up-engine";
import { isFollowUpStopped } from "@/lib/crm/follow-ups";
import type { FollowUpSettings, ProjectStatus } from "@/lib/crm/types";

const TZ = "America/Santiago";

export type FollowUpState = {
  followUpCount: number;
  followUpNextNumber: number | null;
  followUpNextAt: string | null;
  followUpLastAt: string | null;
  status: ProjectStatus;
};

type PendingConfirm = {
  action: FollowUpAction;
  title: string;
  body: string;
  cta: string;
};

function confirmFor(
  action: FollowUpAction,
  settings: FollowUpSettings,
): PendingConfirm {
  const first = settings.intervalDays[0] ?? 3;
  switch (action) {
    case "start":
      return {
        action,
        title: "Comenzar seguimiento",
        body: `Se iniciará la secuencia de ${settings.count} seguimiento${settings.count === 1 ? "" : "s"}. El seguimiento #1 queda agendado en ${first} día${first === 1 ? "" : "s"} y se creará la tarea en Google Tasks.`,
        cta: "Comenzar",
      };
    case "advance":
      return {
        action,
        title: "Forzar siguiente seguimiento",
        body: "Se marcará el seguimiento pendiente como cumplido y se agendará el siguiente según la configuración.",
        cta: "Forzar siguiente",
      };
    case "cancel":
      return {
        action,
        title: "Cancelar seguimientos",
        body: "Se quitará el seguimiento agendado y se eliminará su tarea en Google Tasks. El conteo actual se mantiene.",
        cta: "Cancelar seguimientos",
      };
    case "reset":
      return {
        action,
        title: "Reiniciar seguimientos",
        body: `Volverá a 0 y se agendará el seguimiento #1 en ${first} día${first === 1 ? "" : "s"}.`,
        cta: "Reiniciar",
      };
  }
}

export function FollowUpControls({
  projectId,
  settings,
  state,
  compact = false,
  onChanged,
}: {
  projectId: string;
  settings: FollowUpSettings;
  state: FollowUpState;
  compact?: boolean;
  onChanged?: (state: FollowUpState) => void;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(state);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<PendingConfirm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const stopped = isFollowUpStopped(current.status);
  const pending = current.followUpNextNumber;
  const started = current.followUpCount > 0 || pending != null;
  const atLast = pending != null && pending >= settings.count;

  async function run(action: FollowUpAction) {
    setBusy(true);
    setError(null);
    setMessage(null);
    setWarning(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/follow-ups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        warning?: string | null;
        taskError?: string | null;
        project?: {
          status?: ProjectStatus;
          followUpCount?: number;
          followUpNextNumber?: number | null;
          followUpNextAt?: string | null;
          followUpLastAt?: string | null;
        };
      };
      if (!res.ok) {
        setError(data.error ?? "No se pudo actualizar el seguimiento");
        return;
      }
      const next: FollowUpState = {
        status: data.project?.status ?? current.status,
        followUpCount: data.project?.followUpCount ?? current.followUpCount,
        followUpNextNumber: data.project?.followUpNextNumber ?? null,
        followUpNextAt: data.project?.followUpNextAt ?? null,
        followUpLastAt:
          data.project?.followUpLastAt ?? current.followUpLastAt ?? null,
      };
      setCurrent(next);
      onChanged?.(next);
      setMessage(data.message ?? "Listo");
      setWarning(data.warning ?? null);
      if (data.taskError) {
        setError(data.taskError);
      }
      router.refresh();
    } catch {
      setError("Error de red");
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  function ask(action: FollowUpAction) {
    setError(null);
    setMessage(null);
    setWarning(null);
    if (action === "advance" && pending == null && current.followUpCount > 0) {
      setWarning(
        `Ya estás en el último seguimiento configurado (#${settings.count}). No hay más seguimientos por agendar.`,
      );
      return;
    }
    setConfirming(confirmFor(action, settings));
  }

  const nextLabel = (() => {
    if (stopped) return "Seguimientos detenidos (Aprobado/Rechazado)";
    if (pending == null) {
      return started
        ? `Secuencia completa: ${current.followUpCount}/${settings.count}`
        : "Sin iniciar";
    }
    const when = current.followUpNextAt
      ? formatInTimeZone(new Date(current.followUpNextAt), TZ, "dd/MM/yyyy")
      : null;
    return `Próximo: #${pending}${when ? ` · ${when}` : ""}`;
  })();

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-8 items-center rounded-lg bg-violet-100 px-2.5 text-sm font-semibold tabular-nums text-violet-900">
          {current.followUpCount}/{settings.count}
        </span>
        <span className="text-xs text-muted-strong">{nextLabel}</span>
      </div>

      {current.followUpLastAt ? (
        <p className="text-xs text-muted">
          Último cumplido:{" "}
          {formatInTimeZone(
            new Date(current.followUpLastAt),
            TZ,
            "dd/MM/yyyy HH:mm",
          )}
        </p>
      ) : null}

      {stopped ? null : (
        <div className="flex flex-wrap gap-2">
          {!started ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => ask("start")}
              className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc] disabled:opacity-60"
            >
              Comenzar seguimiento
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => ask("advance")}
                className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc] disabled:opacity-60"
              >
                Forzar siguiente seguimiento
              </button>
              <button
                type="button"
                disabled={busy || pending == null}
                onClick={() => ask("cancel")}
                className="rounded-full border border-border px-4 py-2 text-sm text-muted-strong hover:bg-hover disabled:opacity-50"
              >
                Cancelar seguimientos
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => ask("reset")}
                className="rounded-full border border-border px-4 py-2 text-sm text-muted-strong hover:bg-hover disabled:opacity-60"
              >
                Reiniciar
              </button>
            </>
          )}
        </div>
      )}

      {atLast ? (
        <p className="text-xs text-[#b06000]">
          Estás en el último seguimiento configurado (#{settings.count}).
        </p>
      ) : null}
      {warning ? (
        <p className="text-xs leading-relaxed text-[#b06000]">{warning}</p>
      ) : null}
      {message ? <p className="text-xs text-[#137333]">{message}</p> : null}
      {error ? (
        <p className="text-xs leading-relaxed text-danger">{error}</p>
      ) : null}

      {confirming ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Cerrar"
            onClick={() => !busy && setConfirming(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h4 className="mb-2 text-base font-semibold text-foreground">
              {confirming.title}
            </h4>
            <p className="text-sm text-muted-strong">{confirming.body}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(null)}
                className="rounded-full border border-border px-4 py-2 text-sm"
              >
                Volver
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(confirming.action)}
                className={`rounded-full px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
                  confirming.action === "cancel"
                    ? "bg-danger"
                    : "bg-[#1a73e8]"
                }`}
              >
                {busy ? "Aplicando…" : confirming.cta}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
