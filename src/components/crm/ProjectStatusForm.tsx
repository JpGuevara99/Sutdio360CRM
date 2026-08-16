"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ProjectStatus } from "@/lib/crm/types";
import { PROJECT_STATUS_LABELS } from "@/lib/crm/labels";
import { isFollowUpStopped } from "@/lib/crm/follow-ups";

/** Orden estable del selector (incluye RECHAZADO). */
export const PROJECT_STATUS_ORDER: ProjectStatus[] = [
  "RESERVADO",
  "VISITADO",
  "COTIZADO",
  "SEGUIMIENTO",
  "APROBADO",
  "RECHAZADO",
  "PRODUCCION",
  "INSTALACION",
  "GARANTIA",
  "CERRADO",
];

export function ProjectStatusForm({
  projectId,
  status,
  onChanged,
  compact = false,
}: {
  projectId: string;
  status: ProjectStatus;
  onChanged?: (status: ProjectStatus) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(status);
  }, [status, projectId]);

  async function onChange(next: ProjectStatus) {
    if (next === value) return;

    if (
      (next === "APROBADO" || next === "RECHAZADO") &&
      !window.confirm(
        next === "APROBADO"
          ? "¿Marcar como Aprobado? Se detendrán los seguimientos comerciales."
          : "¿Marcar como Rechazado? Se detendrán los seguimientos comerciales.",
      )
    ) {
      return;
    }

    const previous = value;
    setValue(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setValue(previous);
        setError(data.error ?? "No se pudo actualizar el estado");
        return;
      }
      onChanged?.(next);
      router.refresh();
    } catch {
      setValue(previous);
      setError("Error de red al actualizar el estado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <label className="block text-sm">
        <span
          className={`mb-1 block ${compact ? "font-medium text-muted-strong" : "text-muted"}`}
        >
          Estado del proyecto
        </span>
        <select
          value={value}
          disabled={saving}
          onChange={(e) => void onChange(e.target.value as ProjectStatus)}
          className={`outline-none focus:border-primary ${
            compact
              ? "w-full rounded-lg border border-border px-3 py-2"
              : "rounded border border-border px-3 py-2"
          }`}
        >
          {PROJECT_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {PROJECT_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      {isFollowUpStopped(value) ? (
        <p className="text-xs text-muted">
          Seguimientos detenidos en este estado.
        </p>
      ) : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {saving ? <p className="text-xs text-muted">Guardando…</p> : null}
    </div>
  );
}
