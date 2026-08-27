"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatInTimeZone } from "date-fns-tz";
import { ProjectDrawer } from "@/components/crm/ProjectDrawer";
import { ProjectClosePanel } from "@/components/crm/ProjectClosePanel";
import { FollowUpSettingsModal } from "@/components/crm/FollowUpSettingsModal";
import { NewProjectButton } from "@/components/crm/NewProjectButton";
import { StatusBadge } from "@/components/crm/StatusBadge";
import { formatClp } from "@/lib/crm/labels";
import { formatEntityCode } from "@/lib/crm/project-codes";
import { isFollowUpStopped } from "@/lib/crm/follow-ups";
import {
  CLOSED_STAGE_VISIBLE_DAYS,
  isClosedStageName,
  statusForStage,
} from "@/lib/crm/pipeline";
import type {
  FollowUpSettings,
  PipelineStage,
  ProjectStatus,
  VisitSource,
} from "@/lib/crm/types";

const TZ = "America/Santiago";

export type BoardProject = {
  id: string;
  publicCode: string;
  stageId: string | null;
  boardOrder: number;
  status: ProjectStatus;
  clientName: string;
  address: string | null;
  visitAt: string | null;
  bookedAt: string | null;
  source: VisitSource | null;
  followUpCount: number;
  /** Seguimiento agendado (el número “en curso”) */
  followUpNextNumber: number | null;
  closedAt: string | null;
  /** Total neto de la última cotización del proyecto (null si no tiene) */
  lastQuoteAmount: number | null;
};

type StageDTO = {
  id: string;
  name: string;
  order: number;
};

type Mode = "board" | "settings";

const PAGE_SIZE = 20;
/** ~5 tarjetas visibles; el resto se recorre con scroll */
const COLUMN_BODY_CLASS =
  "pipeline-column-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden p-2";

const boardCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) return pointerHits;
  return rectIntersection(args);
};

function stageDroppableId(stageId: string) {
  return `stage:${stageId}`;
}

function parseStageDroppableId(id: string): string | null {
  return id.startsWith("stage:") ? id.slice("stage:".length) : null;
}

export function ProjectsPipeline({
  initialStages,
  initialProjects,
  initialFollowUpSettings,
  hiddenClosedCount = 0,
}: {
  initialStages: StageDTO[];
  initialProjects: BoardProject[];
  initialFollowUpSettings: FollowUpSettings;
  /** Cierres con más de 45 días que no se muestran en el tablero */
  hiddenClosedCount?: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("board");
  const [stages, setStages] = useState(initialStages);
  const [projects, setProjects] = useState(initialProjects);
  const [followUpSettings, setFollowUpSettings] = useState(
    initialFollowUpSettings,
  );
  const [followUpSettingsOpen, setFollowUpSettingsOpen] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [deletingStageId, setDeletingStageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dndReady, setDndReady] = useState(false);
  const [query, setQuery] = useState("");
  const [pageByStage, setPageByStage] = useState<Record<string, number>>({});
  const [closeTarget, setCloseTarget] = useState<{
    project: BoardProject;
    snapshot: BoardProject[];
  } | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    setStages(initialStages);
    setProjects(initialProjects);
    setFollowUpSettings(initialFollowUpSettings);
  }, [initialStages, initialProjects, initialFollowUpSettings]);

  const closedStageId = useMemo(
    () => stages.find((stage) => isClosedStageName(stage.name))?.id ?? null,
    [stages],
  );

  // Evita mismatch de hidratación de @dnd-kit (aria-describedby DndDescribedBy-N).
  useEffect(() => {
    setDndReady(true);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((project) => {
      const code = formatEntityCode(project.publicCode).toLowerCase();
      return (
        code.includes(q) ||
        project.publicCode.toLowerCase().includes(q) ||
        project.clientName.toLowerCase().includes(q) ||
        (project.address ?? "").toLowerCase().includes(q)
      );
    });
  }, [projects, query]);

  useEffect(() => {
    setPageByStage({});
  }, [query]);

  const projectsByStage = useMemo(() => {
    const map = new Map<string, BoardProject[]>();
    for (const stage of stages) map.set(stage.id, []);
    const unstaged: BoardProject[] = [];
    const sorted = [...projects].sort((a, b) => {
      if (a.boardOrder !== b.boardOrder) return a.boardOrder - b.boardOrder;
      return (b.bookedAt ?? "").localeCompare(a.bookedAt ?? "");
    });
    for (const project of sorted) {
      if (project.stageId && map.has(project.stageId)) {
        map.get(project.stageId)!.push(project);
      } else {
        unstaged.push(project);
      }
    }
    return { map, unstaged };
  }, [projects, stages]);

  const visibleByStage = useMemo(() => {
    const map = new Map<string, BoardProject[]>();
    for (const stage of stages) map.set(stage.id, []);
    const unstaged: BoardProject[] = [];
    const allowed = new Set(filteredProjects.map((p) => p.id));
    for (const [stageId, list] of projectsByStage.map) {
      map.set(
        stageId,
        list.filter((p) => allowed.has(p.id)),
      );
    }
    for (const project of projectsByStage.unstaged) {
      if (allowed.has(project.id)) unstaged.push(project);
    }
    return { map, unstaged };
  }, [filteredProjects, projectsByStage, stages]);

  function stagePage(stageId: string) {
    return pageByStage[stageId] ?? 0;
  }

  function setStagePage(stageId: string, page: number) {
    setPageByStage((prev) => ({ ...prev, [stageId]: Math.max(0, page) }));
  }

  const activeProject = activeProjectId
    ? (projects.find((p) => p.id === activeProjectId) ?? null)
    : null;

  async function persistStageOrder(stageId: string, orderedIds: string[]) {
    const previous = projects;
    const stage = stages.find((s) => s.id === stageId);
    const nextStatus = stage ? statusForStage(stage) : null;
    setProjects((list) => {
      const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
      return list.map((p) => {
        if (!orderMap.has(p.id)) return p;
        const stageChanged = p.stageId !== stageId;
        return {
          ...p,
          stageId,
          boardOrder: orderMap.get(p.id)!,
          ...(nextStatus && stageChanged ? { status: nextStatus } : {}),
        };
      });
    });
    setError(null);
    const res = await fetch("/api/projects/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId, orderedIds }),
    });
    if (!res.ok) {
      setProjects(previous);
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "No se pudo reordenar el proyecto");
      return;
    }
  }

  function onBoardDragStart(event: DragStartEvent) {
    suppressClickRef.current = true;
    setActiveProjectId(String(event.active.id));
  }

  function onBoardDragEnd(event: DragEndEvent) {
    setActiveProjectId(null);
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);

    const { active, over } = event;
    if (!over) return;

    const projectId = String(active.id);
    const overId = String(over.id);
    const activeProjectRow = projects.find((p) => p.id === projectId);
    if (!activeProjectRow) return;

    const overData = over.data.current as
      | { type?: string; stageId?: string | null }
      | undefined;

    let overStageId =
      parseStageDroppableId(overId) ??
      (overData?.type === "column" ? overData.stageId : null) ??
      (overData?.type === "card" ? overData.stageId : null) ??
      null;

    if (!overStageId && projects.some((p) => p.id === overId)) {
      overStageId = projects.find((p) => p.id === overId)?.stageId ?? null;
    }

    if (!overStageId || overStageId === "__unstaged__") return;

    const sourceStageId = activeProjectRow.stageId;

    // Mover a "Cerrado" abre el panel de cierre; el cambio se confirma ahí.
    if (
      closedStageId &&
      overStageId === closedStageId &&
      sourceStageId !== closedStageId
    ) {
      const snapshot = projects;
      setProjects((list) =>
        list.map((p) =>
          p.id === projectId
            ? { ...p, stageId: closedStageId, boardOrder: -Date.now() }
            : p,
        ),
      );
      setError(null);
      setCloseTarget({ project: activeProjectRow, snapshot });
      return;
    }

    const sourceList = (
      sourceStageId && projectsByStage.map.has(sourceStageId)
        ? (projectsByStage.map.get(sourceStageId) ?? [])
        : projectsByStage.unstaged
    ).map((p) => p.id);

    const targetList = (
      projectsByStage.map.get(overStageId) ?? []
    ).map((p) => p.id);

    if (sourceStageId === overStageId) {
      const oldIndex = sourceList.indexOf(projectId);
      const newIndex =
        overData?.type === "card" || projects.some((p) => p.id === overId)
          ? targetList.indexOf(overId)
          : targetList.length - 1;
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      const next = arrayMove(sourceList, oldIndex, newIndex);
      void persistStageOrder(overStageId, next);
      return;
    }

    const withoutActive = targetList.filter((id) => id !== projectId);
    let insertAt = withoutActive.length;
    if (overData?.type === "card" || projects.some((p) => p.id === overId)) {
      const idx = withoutActive.indexOf(overId);
      insertAt = idx >= 0 ? idx : withoutActive.length;
    }
    const nextTarget = [...withoutActive];
    nextTarget.splice(insertAt, 0, projectId);
    void persistStageOrder(overStageId, nextTarget);
  }

  function onSettingsDragStart(event: DragStartEvent) {
    setActiveStageId(String(event.active.id));
  }

  async function onSettingsDragEnd(event: DragEndEvent) {
    setActiveStageId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = stages.findIndex((s) => s.id === active.id);
    const newIndex = stages.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previous = stages;
    const moved = arrayMove(stages, oldIndex, newIndex);
    // "Cerrado" se mantiene al final del tablero.
    const next = [
      ...moved.filter((s) => !isClosedStageName(s.name)),
      ...moved.filter((s) => isClosedStageName(s.name)),
    ].map((stage, order) => ({ ...stage, order }));
    setStages(next);
    setError(null);
    const res = await fetch("/api/pipeline/stages/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: next.map((s) => s.id) }),
    });
    if (!res.ok) {
      setStages(previous);
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "No se pudo reordenar");
      return;
    }
    router.refresh();
  }

  async function renameStage(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const previous = stages;
    setStages((list) =>
      list.map((s) => (s.id === id ? { ...s, name: trimmed } : s)),
    );
    const res = await fetch(`/api/pipeline/stages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (!res.ok) {
      setStages(previous);
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "No se pudo renombrar");
      return;
    }
    router.refresh();
  }

  async function addStage() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/pipeline/stages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nueva etapa" }),
    });
    const data = (await res.json()) as {
      stage?: PipelineStage;
      error?: string;
    };
    setBusy(false);
    if (!res.ok || !data.stage) {
      setError(data.error ?? "No se pudo crear la etapa");
      return;
    }
    setStages((list) => [
      ...list,
      {
        id: data.stage!.id,
        name: data.stage!.name,
        order: data.stage!.order,
      },
    ]);
    router.refresh();
  }

  async function deleteStage(id: string) {
    if (stages.length <= 1) {
      setError("Debe existir al menos una etapa");
      return;
    }
    setDeletingStageId(id);
  }

  async function confirmDeleteStage() {
    if (!deletingStageId) return;
    const id = deletingStageId;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/pipeline/stages/${id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo eliminar");
      setDeletingStageId(null);
      return;
    }
    const fallback = stages.find((s) => s.id !== id)?.id ?? null;
    setStages((list) =>
      list.filter((s) => s.id !== id).map((s, order) => ({ ...s, order })),
    );
    if (fallback) {
      setProjects((list) =>
        list.map((p) => (p.stageId === id ? { ...p, stageId: fallback } : p)),
      );
    }
    setDeletingStageId(null);
    router.refresh();
  }

  function openProject(projectId: string) {
    if (suppressClickRef.current) return;
    setSelectedProjectId(projectId);
  }

  function cancelClose() {
    if (!closeTarget) return;
    setProjects(closeTarget.snapshot);
    setCloseTarget(null);
  }

  const deletingStage = deletingStageId
    ? (stages.find((s) => s.id === deletingStageId) ?? null)
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between gap-3">
        {mode === "board" ? (
          <label className="relative min-w-0 max-w-sm flex-1">
            <span className="sr-only">Buscar proyectos</span>
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
        ) : (
          <p className="text-sm text-muted">Configurar etapas del pipeline</p>
        )}
        {mode === "settings" ? (
          <button
            type="button"
            onClick={() => setMode("board")}
            className="shrink-0 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-strong hover:bg-surface-muted"
          >
            Volver al tablero
          </button>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <NewProjectButton />
            <button
              type="button"
              onClick={() => setMode("settings")}
              title="Configurar pipeline"
              aria-label="Configurar pipeline"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-muted hover:bg-surface-muted hover:text-foreground"
            >
              <PipelineIcon />
            </button>
            <button
              type="button"
              onClick={() => setFollowUpSettingsOpen(true)}
              title="Configurar seguimientos"
              aria-label="Configurar seguimientos"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-muted hover:bg-surface-muted hover:text-foreground"
            >
              <FollowUpIcon />
            </button>
          </div>
        )}
      </div>

      {error ? (
        <p className="rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {mode === "board" ? (
        dndReady ? (
          <DndContext
            id="pipeline-board"
            sensors={sensors}
            collisionDetection={boardCollision}
            onDragStart={onBoardDragStart}
            onDragEnd={onBoardDragEnd}
            onDragCancel={() => {
              setActiveProjectId(null);
              suppressClickRef.current = false;
            }}
          >
            <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-1">
              {stages.map((stage) => (
                <BoardColumn
                  key={stage.id}
                  stage={stage}
                  projects={visibleByStage.map.get(stage.id) ?? []}
                  page={stagePage(stage.id)}
                  onPageChange={(page) => setStagePage(stage.id, page)}
                  onOpen={openProject}
                  hiddenCount={
                    stage.id === closedStageId ? hiddenClosedCount : 0
                  }
                />
              ))}
              {visibleByStage.unstaged.length > 0 ? (
                <BoardColumn
                  stage={{ id: "__unstaged__", name: "Sin etapa", order: 999 }}
                  projects={visibleByStage.unstaged}
                  page={stagePage("__unstaged__")}
                  onPageChange={(page) => setStagePage("__unstaged__", page)}
                  droppable={false}
                  onOpen={openProject}
                />
              ) : null}
            </div>
            <DragOverlay dropAnimation={null}>
              {activeProject ? (
                <ProjectCard project={activeProject} overlay />
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-1">
            {stages.map((stage) => (
              <StaticBoardColumn
                key={stage.id}
                stage={stage}
                projects={visibleByStage.map.get(stage.id) ?? []}
                page={stagePage(stage.id)}
                onPageChange={(page) => setStagePage(stage.id, page)}
                onOpen={openProject}
                hiddenCount={stage.id === closedStageId ? hiddenClosedCount : 0}
              />
            ))}
            {visibleByStage.unstaged.length > 0 ? (
              <StaticBoardColumn
                stage={{ id: "__unstaged__", name: "Sin etapa", order: 999 }}
                projects={visibleByStage.unstaged}
                page={stagePage("__unstaged__")}
                onPageChange={(page) => setStagePage("__unstaged__", page)}
                onOpen={openProject}
              />
            ) : null}
          </div>
        )
      ) : dndReady ? (
        <DndContext
          id="pipeline-settings"
          sensors={sensors}
          collisionDetection={rectIntersection}
          onDragStart={onSettingsDragStart}
          onDragEnd={(e) => void onSettingsDragEnd(e)}
        >
          <SortableContext
            items={stages
              .filter((s) => !isClosedStageName(s.name))
              .map((s) => s.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-1">
              {stages.map((stage) =>
                isClosedStageName(stage.name) ? (
                  <FixedStageColumn
                    key={stage.id}
                    stage={stage}
                    projectCount={projectsByStage.map.get(stage.id)?.length ?? 0}
                  />
                ) : (
                  <SettingsColumn
                    key={stage.id}
                    stage={stage}
                    projectCount={projectsByStage.map.get(stage.id)?.length ?? 0}
                    busy={busy}
                    onRename={(name) => void renameStage(stage.id, name)}
                    onDelete={() => void deleteStage(stage.id)}
                    isDragging={activeStageId === stage.id}
                  />
                ),
              )}
              <div className="flex w-72 shrink-0 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface-muted px-4 py-8 text-center">
                <p className="mb-1 text-sm font-medium text-foreground">
                  Agregar etapa
                </p>
                <p className="mb-4 text-xs text-muted">
                  Las etapas representan el orden comercial del lead.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void addStage()}
                  className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc] disabled:opacity-60"
                >
                  + Nueva etapa
                </button>
              </div>
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {stages.map((stage) => (
            <section
              key={stage.id}
              className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-surface"
            >
              <header className="border-b border-border px-3 py-3">
                <h2 className="truncate text-sm font-semibold text-foreground">
                  {stage.name}
                </h2>
              </header>
              <div className="p-3 text-xs text-muted">
                {projectsByStage.map.get(stage.id)?.length ?? 0} proyecto
                {(projectsByStage.map.get(stage.id)?.length ?? 0) === 1
                  ? ""
                  : "s"}
              </div>
            </section>
          ))}
        </div>
      )}

      <ProjectDrawer
        projectId={selectedProjectId}
        stages={stages}
        followUpSettings={followUpSettings}
        onClose={() => setSelectedProjectId(null)}
        onStageChanged={(projectId, { stageId, status }) => {
          setProjects((list) =>
            list.map((p) =>
              p.id === projectId ? { ...p, stageId, status } : p,
            ),
          );
        }}
        onFollowUpChanged={(projectId, state) => {
          setProjects((list) =>
            list.map((p) =>
              p.id === projectId
                ? {
                    ...p,
                    status: state.status,
                    followUpCount: state.followUpCount,
                    followUpNextNumber: state.followUpNextNumber,
                  }
                : p,
            ),
          );
        }}
      />

      {closeTarget ? (
        <ProjectClosePanel
          projectId={closeTarget.project.id}
          publicCode={closeTarget.project.publicCode}
          clientName={closeTarget.project.clientName}
          onCancel={cancelClose}
          onClosed={({ outcome, closedAt }) => {
            const id = closeTarget.project.id;
            setProjects((list) =>
              list.map((p) =>
                p.id === id
                  ? {
                      ...p,
                      stageId: closedStageId ?? p.stageId,
                      status: outcome,
                      closedAt: new Date(`${closedAt}T12:00:00.000Z`).toISOString(),
                      followUpNextNumber: null,
                    }
                  : p,
              ),
            );
            setCloseTarget(null);
            router.refresh();
          }}
        />
      ) : null}

      {followUpSettingsOpen ? (
        <FollowUpSettingsModal
          settings={followUpSettings}
          onClose={() => setFollowUpSettingsOpen(false)}
          onSaved={(next) => setFollowUpSettings(next)}
        />
      ) : null}

      {deletingStage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Cerrar"
            onClick={() => setDeletingStageId(null)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h3 className="mb-3 text-base font-semibold text-foreground">
              Eliminar etapa
            </h3>
            <p className="text-sm text-muted-strong">
              ¿Seguro que quieres eliminar{" "}
              <span className="font-medium text-foreground">
                {deletingStage.name}
              </span>
              ? Los proyectos se moverán a otra etapa. Esta acción no se puede
              deshacer.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingStageId(null)}
                className="rounded-full border border-border px-4 py-2 text-sm text-muted-strong hover:bg-hover"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmDeleteStage()}
                className="rounded-full bg-[#d93025] px-4 py-2 text-sm font-medium text-white hover:bg-[#c5221f] disabled:opacity-60"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function paginateProjects(projects: BoardProject[], page: number) {
  const totalPages = Math.max(1, Math.ceil(projects.length / PAGE_SIZE));
  const current = Math.min(page, totalPages - 1);
  const start = current * PAGE_SIZE;
  return {
    page: current,
    totalPages,
    visible: projects.slice(start, start + PAGE_SIZE),
    showPager: projects.length > PAGE_SIZE,
  };
}

function ColumnPager({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const from = page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border bg-surface px-2 py-1.5">
      <button
        type="button"
        disabled={page <= 0}
        onClick={() => onPageChange(page - 1)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted hover:bg-hover disabled:opacity-30"
        aria-label="Página anterior"
      >
        <ChevronIcon direction="left" />
      </button>
      <p className="text-[11px] text-muted">
        {from}–{to} / {total}
      </p>
      <button
        type="button"
        disabled={page >= totalPages - 1}
        onClick={() => onPageChange(page + 1)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted hover:bg-hover disabled:opacity-30"
        aria-label="Página siguiente"
      >
        <ChevronIcon direction="right" />
      </button>
    </div>
  );
}

function StaticBoardColumn({
  stage,
  projects,
  page,
  onPageChange,
  onOpen,
  hiddenCount = 0,
}: {
  stage: StageDTO;
  projects: BoardProject[];
  page: number;
  onPageChange: (page: number) => void;
  onOpen: (projectId: string) => void;
  hiddenCount?: number;
}) {
  const paged = paginateProjects(projects, page);
  return (
    <section className="flex h-full min-h-0 w-72 shrink-0 flex-col rounded-xl border border-border bg-surface-muted">
      <header className="border-b border-border bg-surface px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {stage.name}
          </h2>
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-text">
            {projects.length}
          </span>
        </div>
        {hiddenCount > 0 ? (
          <p className="mt-1 text-[11px] text-muted">
            {hiddenCount} oculto{hiddenCount === 1 ? "" : "s"} con más de{" "}
            {CLOSED_STAGE_VISIBLE_DAYS} días
          </p>
        ) : null}
      </header>
      <div className={COLUMN_BODY_CLASS}>
        {paged.visible.map((project) => (
          <div key={project.id} onClick={() => onOpen(project.id)}>
            <ProjectCard project={project} />
          </div>
        ))}
      </div>
      {paged.showPager ? (
        <ColumnPager
          page={paged.page}
          totalPages={paged.totalPages}
          total={projects.length}
          onPageChange={onPageChange}
        />
      ) : null}
    </section>
  );
}

function BoardColumn({
  stage,
  projects,
  page,
  onPageChange,
  droppable = true,
  onOpen,
  hiddenCount = 0,
}: {
  stage: StageDTO;
  projects: BoardProject[];
  page: number;
  onPageChange: (page: number) => void;
  droppable?: boolean;
  onOpen: (projectId: string) => void;
  hiddenCount?: number;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: stageDroppableId(stage.id),
    disabled: !droppable,
    data: { type: "column", stageId: stage.id },
  });
  const paged = paginateProjects(projects, page);

  return (
    <section
      ref={setNodeRef}
      className={`flex h-full min-h-0 w-72 shrink-0 flex-col rounded-xl border bg-surface-muted ${
        isOver ? "border-primary ring-2 ring-primary/30" : "border-border"
      }`}
    >
      <header className="border-b border-border bg-surface px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {stage.name}
          </h2>
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-text">
            {projects.length}
          </span>
        </div>
        {hiddenCount > 0 ? (
          <p className="mt-1 text-[11px] text-muted">
            {hiddenCount} oculto{hiddenCount === 1 ? "" : "s"} con más de{" "}
            {CLOSED_STAGE_VISIBLE_DAYS} días
          </p>
        ) : null}
      </header>
      <div className={COLUMN_BODY_CLASS}>
        <SortableContext
          items={paged.visible.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          {paged.visible.map((project) => (
            <DraggableProjectCard
              key={project.id}
              project={project}
              onOpen={() => onOpen(project.id)}
            />
          ))}
        </SortableContext>
      </div>
      {paged.showPager ? (
        <ColumnPager
          page={paged.page}
          totalPages={paged.totalPages}
          total={projects.length}
          onPageChange={onPageChange}
        />
      ) : null}
    </section>
  );
}

function DraggableProjectCard({
  project,
  onOpen,
}: {
  project: BoardProject;
  onOpen: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: project.id,
    data: { type: "card", stageId: project.stageId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? "opacity-30" : undefined}
      {...attributes}
      {...listeners}
      onClick={onOpen}
    >
      <ProjectCard project={project} />
    </div>
  );
}

function ProjectCard({
  project,
  overlay = false,
}: {
  project: BoardProject;
  overlay?: boolean;
}) {
  const stopped = isFollowUpStopped(project.status);
  // Visualizador: el seguimiento en curso (agendado) o el último cumplido.
  const shown = project.followUpNextNumber ?? project.followUpCount ?? 0;

  return (
    <article
      className={`relative cursor-grab rounded-lg border border-border bg-surface p-3 pb-8 shadow-sm active:cursor-grabbing ${
        overlay
          ? "scale-[1.02] shadow-xl ring-2 ring-primary"
          : "hover:border-primary"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-primary">
          {formatEntityCode(project.publicCode)}
        </p>
        <StatusBadge status={project.status} />
      </div>
      <p className="text-sm font-medium text-foreground">{project.clientName}</p>
      <p className="mt-0.5 line-clamp-2 text-xs text-muted">
        {project.address ?? "Sin dirección"}
      </p>
      <div className="mt-2 space-y-0.5 text-xs text-muted">
        <p>
          Visita:{" "}
          <span className="font-semibold text-foreground">
            {project.visitAt
              ? formatInTimeZone(
                  new Date(project.visitAt),
                  TZ,
                  "dd/MM/yyyy HH:mm",
                )
              : "—"}
          </span>
        </p>
        <p>
          Agendado:{" "}
          {project.bookedAt
            ? formatInTimeZone(
                new Date(project.bookedAt),
                TZ,
                "dd/MM/yyyy HH:mm",
              )
            : "—"}
        </p>
      </div>
      <span
        title={
          project.lastQuoteAmount != null
            ? "Total neto de la última cotización"
            : "Sin cotizaciones"
        }
        className="absolute bottom-2 left-3 text-[11px] font-semibold tabular-nums text-muted-strong"
      >
        {project.lastQuoteAmount != null
          ? formatClp(project.lastQuoteAmount)
          : "$ —"}
      </span>
      <span
        title={
          stopped
            ? "Seguimientos detenidos (Aprobado/Rechazado)"
            : project.followUpNextNumber
              ? `Seguimiento #${project.followUpNextNumber} en curso`
              : project.followUpCount > 0
                ? `Último seguimiento cumplido: #${project.followUpCount}`
                : "Sin seguimientos"
        }
        className={`absolute bottom-2 right-2 inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-[11px] font-semibold tabular-nums ${
          stopped
            ? "bg-neutral-200 text-neutral-500"
            : "bg-violet-100 text-violet-900"
        }`}
      >
        {shown}
      </span>
    </article>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3-3" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {direction === "left" ? (
        <path d="m15 18-6-6 6-6" />
      ) : (
        <path d="m9 18 6-6-6-6" />
      )}
    </svg>
  );
}

function PipelineIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="6" cy="4" r="2" />
      <circle cx="6" cy="20" r="2" />
      <circle cx="18" cy="10" r="2" />
      <path d="M6 6v12" />
      <path d="M6 12h8a2 2 0 0 0 2-2V10" />
    </svg>
  );
}

function FollowUpIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 1.5" />
      <path d="M5 3 3 5" />
      <path d="m19 3 2 2" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** Etapa fija: no se renombra, no se elimina y no se reordena. */
function FixedStageColumn({
  stage,
  projectCount,
}: {
  stage: StageDTO;
  projectCount: number;
}) {
  return (
    <section className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-surface-muted/60">
      <header className="flex items-center gap-2 border-b border-border px-3 py-3">
        <span className="text-muted">
          <LockIcon />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {stage.name}
        </h2>
        <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">
          Fija
        </span>
      </header>
      <div className="flex flex-1 flex-col gap-3 p-3">
        <p className="text-xs text-muted">
          {projectCount} proyecto{projectCount === 1 ? "" : "s"} en esta etapa
        </p>
        <p className="text-xs leading-relaxed text-muted">
          Etapa de cierre del pipeline. No se puede renombrar, eliminar ni
          mover: al arrastrar una tarjeta aquí se abre el panel de cierre y las
          tarjetas se ocultan del tablero a los {CLOSED_STAGE_VISIBLE_DAYS}{" "}
          días.
        </p>
      </div>
    </section>
  );
}

function SettingsColumn({
  stage,
  projectCount,
  busy,
  onRename,
  onDelete,
  isDragging,
}: {
  stage: StageDTO;
  projectCount: number;
  busy: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
  isDragging: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: stage.id });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);

  useEffect(() => {
    setName(stage.name);
  }, [stage.name]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function commit() {
    setEditing(false);
    if (name.trim() && name.trim() !== stage.name) onRename(name);
    else setName(stage.name);
  }

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={`flex w-72 shrink-0 flex-col rounded-xl border bg-surface ${
        editing || isDragging
          ? "border-primary shadow-md"
          : "border-border"
      } ${isDragging ? "opacity-80" : ""}`}
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-3">
        <button
          type="button"
          className="cursor-grab text-muted active:cursor-grabbing"
          aria-label="Reordenar etapa"
          {...attributes}
          {...listeners}
        >
          <DragHandleIcon />
        </button>
        {editing ? (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setName(stage.name);
                  setEditing(false);
                }
              }}
              className="min-w-0 flex-1 rounded border border-primary px-2 py-1 text-sm outline-none"
            />
            <button
              type="button"
              onClick={commit}
              className="rounded px-1.5 py-1 text-green-600 hover:bg-green-50"
              aria-label="Guardar nombre"
            >
              ✓
            </button>
            <button
              type="button"
              onClick={() => {
                setName(stage.name);
                setEditing(false);
              }}
              className="rounded px-1.5 py-1 text-danger hover:bg-danger-soft"
              aria-label="Cancelar"
            >
              ✕
            </button>
          </div>
        ) : (
          <>
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              {stage.name}
            </h2>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded p-1 text-muted hover:bg-hover"
              aria-label="Editar etapa"
            >
              <PencilIcon />
            </button>
          </>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-3 p-3">
        <p className="text-xs text-muted">
          {projectCount} proyecto{projectCount === 1 ? "" : "s"} en esta etapa
        </p>
        <p className="text-xs leading-relaxed text-muted">
          Arrastra el asa para cambiar el orden del pipeline comercial.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="mt-auto rounded-full border border-danger-border px-3 py-2 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-60"
        >
          Eliminar etapa
        </button>
      </div>
    </section>
  );
}

function DragHandleIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="4" cy="3" r="1.2" />
      <circle cx="10" cy="3" r="1.2" />
      <circle cx="4" cy="7" r="1.2" />
      <circle cx="10" cy="7" r="1.2" />
      <circle cx="4" cy="11" r="1.2" />
      <circle cx="10" cy="11" r="1.2" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"
        fill="currentColor"
      />
      <path
        d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
        fill="currentColor"
      />
    </svg>
  );
}
