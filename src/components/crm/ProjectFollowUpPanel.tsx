"use client";

import {
  FollowUpControls,
  type FollowUpState,
} from "@/components/crm/FollowUpControls";
import { formatEntityCode } from "@/lib/crm/project-codes";
import type { FollowUpSettings, ProjectStatus } from "@/lib/crm/types";

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : new Date(value).toISOString();
}

export function ProjectFollowUpPanel({
  projectId,
  publicCode,
  status,
  settings,
  followUpCount,
  followUpLastAt,
  followUpNextNumber,
  followUpNextAt,
}: {
  projectId: string;
  publicCode: string;
  status: ProjectStatus;
  settings: FollowUpSettings;
  followUpCount: number;
  followUpLastAt: Date | string | null;
  followUpNextNumber: number | null;
  followUpNextAt: Date | string | null;
}) {
  const state: FollowUpState = {
    status,
    followUpCount,
    followUpNextNumber,
    followUpNextAt: toIso(followUpNextAt),
    followUpLastAt: toIso(followUpLastAt),
  };

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-1 text-sm font-medium text-foreground">Seguimientos</h3>
      <p className="mb-4 text-xs text-muted">
        {settings.count} seguimiento{settings.count === 1 ? "" : "s"} en{" "}
        {formatEntityCode(publicCode)} · espera de{" "}
        {settings.intervalDays.map((d) => `${d}d`).join(" / ")}. Cada uno crea
        una tarea en Google Tasks con el WhatsApp del cliente. Se detienen en
        Aprobado o Rechazado.
      </p>
      <FollowUpControls
        projectId={projectId}
        settings={settings}
        state={state}
      />
    </section>
  );
}
