"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ProjectClosePanel } from "@/components/crm/ProjectClosePanel";
import type { PipelineStage, ProjectStatus } from "@/lib/crm/types";
import { isFollowUpStopped } from "@/lib/crm/follow-ups";
import {
  closedStageIdFromList,
  isClosedStageName,
  sortStages,
  statusForStage,
} from "@/lib/crm/pipeline";

export function ProjectStatusForm({
  projectId,
  stageId,
  status,
  publicCode,
  clientName,
  stages: stagesProp,
  onChanged,
  compact = false,
}: {
  projectId: string;
  stageId: string | null;
  status: ProjectStatus;
  publicCode?: string;
  clientName?: string;
  stages?: Array<Pick<PipelineStage, "id" | "name" | "order">>;
  onChanged?: (update: { stageId: string; status: ProjectStatus }) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(stageId ?? "");
  const [currentStatus, setCurrentStatus] = useState(status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedStages, setFetchedStages] = useState<PipelineStage[]>([]);
  const [closeOpen, setCloseOpen] = useState(false);

  const stages = useMemo(() => {
    const list = stagesProp?.length
      ? (stagesProp as PipelineStage[])
      : fetchedStages;
    return sortStages(list);
  }, [stagesProp, fetchedStages]);

  const closedStageId = useMemo(
    () => closedStageIdFromList(stages),
    [stages],
  );

  useEffect(() => {
    setValue(stageId ?? "");
    setCurrentStatus(status);
  }, [stageId, status, projectId]);

  useEffect(() => {
    if (stagesProp?.length) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/pipeline/stages");
        const data = (await res.json()) as { stages?: PipelineStage[] };
        if (!cancelled && data.stages) setFetchedStages(data.stages);
      } catch {
        /* pipeline opcional en UI */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stagesProp]);

  async function applyStage(nextStageId: string) {
    const previousStageId = value;
    const previousStatus = currentStatus;
    const stage = stages.find((s) => s.id === nextStageId);
    if (!stage) return;

    const inferredStatus = statusForStage(stage);
    const nextStatus = inferredStatus ?? currentStatus;
    setValue(nextStageId);
    setCurrentStatus(nextStatus);
    setSaving(true);
    setError(null);

    const payload: Record<string, unknown> = {
      stageId: nextStageId,
      boardOrder: Date.now(),
    };
    if (inferredStatus) {
      payload.status = inferredStatus;
    }

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setValue(previousStageId);
        setCurrentStatus(previousStatus);
        setError(data.error ?? "No se pudo cambiar la etapa");
        return;
      }
      onChanged?.({ stageId: nextStageId, status: nextStatus });
      if (!onChanged) {
        router.refresh();
      }
    } catch {
      setValue(previousStageId);
      setCurrentStatus(previousStatus);
      setError("Error de red al cambiar la etapa");
    } finally {
      setSaving(false);
    }
  }

  async function onChange(nextStageId: string) {
    if (nextStageId === value || saving || closeOpen) return;

    if (closedStageId && nextStageId === closedStageId) {
      if (value === closedStageId) return;
      if (!publicCode || !clientName) {
        setError("Falta información del proyecto para cerrar");
        return;
      }
      setCloseOpen(true);
      return;
    }

    const stage = stages.find((s) => s.id === nextStageId);
    const nextStatus = stage ? statusForStage(stage) : null;
    if (
      nextStatus === "APROBADO" &&
      !window.confirm(
        "¿Mover a Aprobado? Se detendrán los seguimientos comerciales.",
      )
    ) {
      return;
    }

    await applyStage(nextStageId);
  }

  const selectValue = value;

  return (
    <>
      <div className={compact ? "space-y-1" : "space-y-1.5"}>
        <label className="block text-sm">
          <span
            className={`mb-1 block ${compact ? "font-medium text-muted-strong" : "text-muted"}`}
          >
            Etapa del pipeline
          </span>
          <select
            value={selectValue}
            disabled={saving || closeOpen || stages.length === 0}
            onChange={(e) => void onChange(e.target.value)}
            className={`outline-none focus:border-primary ${
              compact
                ? "w-full rounded-lg border border-border px-3 py-2"
                : "rounded border border-border px-3 py-2"
            }`}
          >
            {stages.length === 0 ? (
              <option value="">Cargando etapas…</option>
            ) : (
              <>
                {!selectValue ? (
                  <option value="" disabled>
                    Selecciona etapa…
                  </option>
                ) : null}
                {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                  {isClosedStageName(stage.name) ? " — requiere cierre" : ""}
                </option>
              ))}
              </>
            )}
          </select>
        </label>
        {isFollowUpStopped(currentStatus) ? (
          <p className="text-xs text-muted">
            Seguimientos detenidos en este estado.
          </p>
        ) : null}
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        {saving ? <p className="text-xs text-muted">Guardando…</p> : null}
      </div>

      {closeOpen && publicCode && clientName && closedStageId ? (
        <ProjectClosePanel
          projectId={projectId}
          publicCode={publicCode}
          clientName={clientName}
          onCancel={() => {
            setCloseOpen(false);
            setValue(stageId ?? "");
            setCurrentStatus(status);
          }}
          onClosed={({ outcome }) => {
            setCloseOpen(false);
            setValue(closedStageId);
            setCurrentStatus(outcome);
            onChanged?.({ stageId: closedStageId, status: outcome });
            if (!onChanged) {
              router.refresh();
            }
          }}
        />
      ) : null}
    </>
  );
}
