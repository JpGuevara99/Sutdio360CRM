"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { StatusBadge } from "@/components/crm/StatusBadge";
import { ProjectNotesPanel } from "@/components/crm/ProjectNotesPanel";
import { VISIT_SOURCE_LABELS, clientFullName } from "@/lib/crm/labels";
import { formatEntityCode } from "@/lib/crm/project-codes";
import type {
  Client,
  FileRef,
  PipelineStage,
  ProjectStatus,
  Visit,
  VisitSource,
} from "@/lib/crm/types";

const TZ = "America/Santiago";

type ProjectDetail = {
  id: string;
  publicCode: string;
  status: ProjectStatus;
  stageId: string | null;
  title: string | null;
  driveFolderUrl: string | null;
  client: Client;
  files: FileRef[];
  projectNotes: Array<{
    id: string;
    body: string;
    createdAt: string;
  }>;
  visits: Array<{
    id: string;
    scheduledAt: string;
    bookedAt: string;
    durationMin: number;
    source: VisitSource;
    notes: string | null;
  }>;
};

export function ProjectDrawer({
  projectId,
  stages,
  onClose,
  onStageChanged,
}: {
  projectId: string | null;
  stages: Array<Pick<PipelineStage, "id" | "name" | "order">>;
  onClose: () => void;
  onStageChanged: (projectId: string, stageId: string) => void;
}) {
  const open = Boolean(projectId);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [stageId, setStageId] = useState("");

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setUploadMessage(null);

    void (async () => {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = (await res.json()) as {
        project?: {
          id: string;
          publicCode: string;
          status: ProjectStatus;
          stageId: string | null;
          title: string | null;
          driveFolderUrl: string | null;
          client: Client;
          files?: FileRef[];
          projectNotes?: Array<{
            id: string;
            body: string;
            createdAt: string | Date;
          }>;
          visits: Array<
            Visit & { bookedAt?: Date | string; createdAt: Date | string }
          >;
        };
        error?: string;
      };

      if (cancelled) return;
      setLoading(false);

      if (!res.ok || !data.project) {
        setError(data.error ?? "No se pudo cargar el proyecto");
        return;
      }

      const detail: ProjectDetail = {
        id: data.project.id,
        publicCode: data.project.publicCode,
        status: data.project.status,
        stageId: data.project.stageId,
        title: data.project.title,
        driveFolderUrl: data.project.driveFolderUrl,
        client: data.project.client,
        files: data.project.files ?? [],
        projectNotes: (data.project.projectNotes ?? []).map((n) => ({
          id: n.id,
          body: n.body,
          createdAt:
            typeof n.createdAt === "string"
              ? n.createdAt
              : new Date(n.createdAt).toISOString(),
        })),
        visits: data.project.visits.map((v) => {
          const scheduledAt =
            typeof v.scheduledAt === "string"
              ? v.scheduledAt
              : new Date(v.scheduledAt).toISOString();
          const bookedRaw = v.bookedAt ?? v.createdAt;
          const bookedAt =
            typeof bookedRaw === "string"
              ? bookedRaw
              : new Date(bookedRaw).toISOString();
          return {
            id: v.id,
            scheduledAt,
            bookedAt,
            durationMin: v.durationMin,
            source: v.source,
            notes: v.notes,
          };
        }),
      };

      setProject(detail);
      setStageId(detail.stageId ?? stages[0]?.id ?? "");
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, stages]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function saveStage(nextStageId: string) {
    if (!project || nextStageId === project.stageId) return;
    setStageId(nextStageId);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stageId: nextStageId,
          boardOrder: Date.now(),
        }),
      });
      if (!res.ok) {
        setStageId(project.stageId ?? "");
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "No se pudo cambiar la fase");
        return;
      }
      setProject((p) => (p ? { ...p, stageId: nextStageId } : p));
      onStageChanged(project.id, nextStageId);
    } catch {
      setStageId(project.stageId ?? "");
      setError("Error de red al cambiar la fase");
    } finally {
      setSaving(false);
    }
  }

  async function onUploadFile(event: React.ChangeEvent<HTMLInputElement>) {
    if (!project) return;
    const selected = event.target.files?.[0];
    if (!selected) return;

    setUploading(true);
    setError(null);
    setUploadMessage(null);

    const body = new FormData();
    body.append("file", selected);

    try {
      const res = await fetch(`/api/projects/${project.id}/files`, {
        method: "POST",
        body,
      });
      const data = (await res.json()) as { error?: string; file?: FileRef };
      if (!res.ok || !data.file) {
        setError(data.error ?? "No se pudo subir el archivo");
        return;
      }
      setProject((p) =>
        p ? { ...p, files: [data.file!, ...p.files] } : p,
      );
      setUploadMessage(`Subido: ${data.file.name}`);
    } catch {
      setError("Error de red al subir el archivo");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  const visit = project?.visits[0];

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/25 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Proyecto
            </p>
            <h2 className="truncate text-lg font-semibold text-foreground">
              {project ? formatEntityCode(project.publicCode) : "Cargando…"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-lg leading-none text-muted hover:bg-hover"
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-muted">Cargando información…</p>
          ) : null}
          {error ? (
            <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          {project ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={project.status} />
                <span className="rounded bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-text">
                  {formatEntityCode(project.client.leadCode)}
                </span>
              </div>

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-muted-strong">
                  Fase del pipeline
                </span>
                <select
                  value={stageId}
                  disabled={saving}
                  onChange={(e) => void saveStage(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 outline-none focus:border-primary"
                >
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </select>
              </label>

              <section className="space-y-2 text-sm">
                <h3 className="font-medium text-foreground">Cliente</h3>
                <dl className="space-y-1.5 text-muted-strong">
                  <Row label="Nombre" value={clientFullName(project.client)} />
                  <Row label="Teléfono" value={project.client.phone ?? "—"} />
                  <Row label="Email" value={project.client.email ?? "—"} />
                  <Row
                    label="Dirección"
                    value={project.client.address ?? "—"}
                  />
                </dl>
              </section>

              <section className="space-y-2 text-sm">
                <h3 className="font-medium text-foreground">Visita</h3>
                {visit ? (
                  <dl className="space-y-1.5 text-muted-strong">
                    <Row
                      label="Visita"
                      value={formatInTimeZone(
                        new Date(visit.scheduledAt),
                        TZ,
                        "dd/MM/yyyy HH:mm",
                      )}
                      emphasize
                    />
                    <Row
                      label="Agendado"
                      value={formatInTimeZone(
                        new Date(visit.bookedAt),
                        TZ,
                        "dd/MM/yyyy HH:mm",
                      )}
                    />
                    <Row
                      label="Origen"
                      value={VISIT_SOURCE_LABELS[visit.source]}
                    />
                    <Row label="Duración" value={`${visit.durationMin} min`} />
                  </dl>
                ) : (
                  <p className="text-muted">Sin visita registrada</p>
                )}
              </section>

              <section className="space-y-2">
                <ProjectNotesPanel
                  key={project.id}
                  projectId={project.id}
                  initialNotes={project.projectNotes}
                  compact
                />
              </section>

              <div className="space-y-2 border-t border-border pt-4">
                {uploadMessage ? (
                  <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-text">
                    {uploadMessage}
                  </p>
                ) : null}

                <label
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm text-foreground transition hover:border-primary hover:bg-primary-soft/40 ${
                    uploading ? "pointer-events-none opacity-60" : ""
                  }`}
                >
                  <UploadFileIcon />
                  <span className="font-medium">
                    {uploading ? "Subiendo…" : "Subir archivo"}
                  </span>
                  <input
                    type="file"
                    accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.heic"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => void onUploadFile(e)}
                  />
                </label>

                {project.driveFolderUrl ? (
                  <a
                    href={project.driveFolderUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm text-foreground transition hover:border-primary hover:bg-primary-soft/40"
                  >
                    <GoogleDriveIcon />
                    <span className="font-medium">
                      Abrir carpeta del proyecto
                    </span>
                  </a>
                ) : null}

                <Link
                  href={`/proyectos/${project.id}`}
                  className="flex items-center justify-between rounded-lg bg-primary-soft px-3 py-2.5 text-sm font-medium text-primary-text transition hover:bg-primary-soft"
                >
                  <span>Ver ficha completa</span>
                  <span aria-hidden>→</span>
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}

function Row({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2">
      <dt className="text-muted">{label}</dt>
      <dd
        className={`break-words text-foreground ${emphasize ? "font-semibold" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function UploadFileIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="text-primary"
    >
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" />
    </svg>
  );
}

function GoogleDriveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 87.3 78" aria-hidden>
      <path
        d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"
        fill="#0066da"
      />
      <path
        d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z"
        fill="#00ac47"
      />
      <path
        d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z"
        fill="#ea4335"
      />
      <path
        d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"
        fill="#00832d"
      />
      <path
        d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
        fill="#2684fc"
      />
      <path
        d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
        fill="#ffba00"
      />
    </svg>
  );
}
