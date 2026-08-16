import { db } from "@/lib/db";
import {
  clampFollowUpCount,
  dueDateForFollowUp,
  followUpTaskNotes,
  followUpTaskTitle,
  isFollowUpStopped,
} from "@/lib/crm/follow-ups";
import { clientFullName } from "@/lib/crm/labels";
import { formatEntityCode } from "@/lib/crm/project-codes";
import { getAppUrl } from "@/lib/env";
import type {
  FollowUpSettings,
  ProjectWithRelations,
} from "@/lib/crm/types";
import { isGoogleConfigured } from "@/lib/google/auth";
import {
  createGoogleTask,
  deleteGoogleTask,
  googleErrorMessage,
} from "@/lib/google/tasks";

export type FollowUpAction = "start" | "advance" | "cancel" | "reset";

export type FollowUpActionResult = {
  project: ProjectWithRelations;
  settings: FollowUpSettings;
  /** Seguimiento agendado tras la acción (null si no quedó ninguno) */
  scheduledNumber: number | null;
  scheduledAt: Date | null;
  taskId: string | null;
  /** Motivo por el que no se pudo crear la tarea en Google Tasks */
  taskError: string | null;
  /** Aviso no bloqueante, ej. último seguimiento alcanzado */
  warning: string | null;
  message: string;
};

type Scheduled = {
  number: number;
  dueAt: Date;
  taskId: string | null;
  taskListId: string | null;
  taskError: string | null;
};

async function loadProject(projectId: string): Promise<ProjectWithRelations> {
  const project = await db.getProjectById(projectId);
  if (!project) throw new Error("Proyecto no encontrado");
  return project;
}

/** Crea la task del seguimiento N con vencimiento según la configuración. */
async function scheduleFollowUp(
  project: ProjectWithRelations,
  followUpNumber: number,
  settings: FollowUpSettings,
  from = new Date(),
): Promise<Scheduled> {
  const dueAt = dueDateForFollowUp(followUpNumber, settings, from);
  let taskId: string | null = null;
  let taskListId: string | null = null;
  let taskError: string | null = null;

  if (isGoogleConfigured()) {
    try {
      const created = await createGoogleTask({
        title: followUpTaskTitle({
          followUpNumber,
          projectCode: formatEntityCode(project.publicCode),
          clientName: clientFullName(project.client),
        }),
        notes: followUpTaskNotes({
          followUpNumber,
          clientName: clientFullName(project.client),
          phone: project.client.phone,
          projectUrl: `${getAppUrl()}/proyectos/${project.id}`,
        }),
        due: dueAt,
      });
      taskId = created.taskId;
      taskListId = created.taskListId;
    } catch (error) {
      console.error("scheduleFollowUp: Google Tasks failed", error);
      taskError = googleErrorMessage(error);
    }
  } else {
    taskError = "Google no está configurado";
  }

  return { number: followUpNumber, dueAt, taskId, taskListId, taskError };
}

/** Borra la task pendiente, si existe. Devuelve el error si no se pudo. */
export async function cancelPendingFollowUpTask(
  project: ProjectWithRelations,
): Promise<string | null> {
  if (!project.followUpTaskId || !isGoogleConfigured()) return null;
  try {
    await deleteGoogleTask({
      taskId: project.followUpTaskId,
      taskListId: project.followUpTaskListId,
    });
    return null;
  } catch (error) {
    console.error("cancelPendingFollowUpTask failed", error);
    return googleErrorMessage(error);
  }
}

function ensureRunnable(project: ProjectWithRelations) {
  if (isFollowUpStopped(project.status)) {
    throw new Error(
      "Los seguimientos están detenidos en proyectos Aprobados o Rechazados",
    );
  }
}

async function finish(
  projectId: string,
  settings: FollowUpSettings,
  scheduled: Scheduled | null,
  extras: { warning?: string | null; message: string },
): Promise<FollowUpActionResult> {
  const project = await loadProject(projectId);
  return {
    project,
    settings,
    scheduledNumber: scheduled?.number ?? null,
    scheduledAt: scheduled?.dueAt ?? null,
    taskId: scheduled?.taskId ?? null,
    taskError: scheduled?.taskError ?? null,
    warning: extras.warning ?? null,
    message: extras.message,
  };
}

export async function startFollowUps(
  projectId: string,
): Promise<FollowUpActionResult> {
  const project = await loadProject(projectId);
  ensureRunnable(project);
  const settings = await db.getFollowUpSettings();

  await cancelPendingFollowUpTask(project);
  const now = new Date();
  const scheduled = await scheduleFollowUp(project, 1, settings, now);

  await db.updateProject(project.id, {
    status: "SEGUIMIENTO",
    followUpCount: 0,
    followUpStartedAt: now,
    followUpLastAt: null,
    followUpNextNumber: scheduled.number,
    followUpNextAt: scheduled.dueAt,
    followUpTaskId: scheduled.taskId,
    followUpTaskListId: scheduled.taskListId,
  });

  return finish(project.id, settings, scheduled, {
    message: `Seguimiento #1 agendado`,
  });
}

export async function advanceFollowUp(
  projectId: string,
): Promise<FollowUpActionResult> {
  const project = await loadProject(projectId);
  ensureRunnable(project);
  const settings = await db.getFollowUpSettings();

  const done = clampFollowUpCount(project.followUpCount, settings.count);
  const pending = project.followUpNextNumber ?? (done < settings.count ? done + 1 : null);

  if (pending == null) {
    return finish(project.id, settings, null, {
      warning: `Ya estás en el último seguimiento configurado (#${settings.count}). No hay más seguimientos por agendar.`,
      message: "Sin cambios",
    });
  }

  await cancelPendingFollowUpTask(project);

  const now = new Date();
  const completed = Math.min(settings.count, pending);
  const nextNumber = completed + 1;

  if (nextNumber > settings.count) {
    await db.updateProject(project.id, {
      followUpCount: completed,
      followUpLastAt: now,
      followUpStartedAt: project.followUpStartedAt ?? now,
      followUpNextNumber: null,
      followUpNextAt: null,
      followUpTaskId: null,
      followUpTaskListId: null,
    });
    return finish(project.id, settings, null, {
      warning: `Ya estás en el último seguimiento configurado (#${settings.count}).`,
      message: `Seguimiento #${completed} registrado. Secuencia completa.`,
    });
  }

  const scheduled = await scheduleFollowUp(project, nextNumber, settings, now);
  await db.updateProject(project.id, {
    status: "SEGUIMIENTO",
    followUpCount: completed,
    followUpLastAt: now,
    followUpStartedAt: project.followUpStartedAt ?? now,
    followUpNextNumber: scheduled.number,
    followUpNextAt: scheduled.dueAt,
    followUpTaskId: scheduled.taskId,
    followUpTaskListId: scheduled.taskListId,
  });

  return finish(project.id, settings, scheduled, {
    message: `Seguimiento #${completed} registrado. Se agendó el #${scheduled.number}.`,
  });
}

export async function cancelFollowUps(
  projectId: string,
): Promise<FollowUpActionResult> {
  const project = await loadProject(projectId);
  const settings = await db.getFollowUpSettings();
  const taskError = await cancelPendingFollowUpTask(project);

  await db.updateProject(project.id, {
    followUpNextNumber: null,
    followUpNextAt: null,
    followUpTaskId: null,
    followUpTaskListId: null,
  });

  const result = await finish(project.id, settings, null, {
    message: taskError
      ? "Seguimientos cancelados (la tarea de Google no se pudo borrar)"
      : "Seguimientos cancelados y tarea eliminada",
  });
  return { ...result, taskError };
}

export async function resetFollowUps(
  projectId: string,
): Promise<FollowUpActionResult> {
  const project = await loadProject(projectId);
  ensureRunnable(project);
  const settings = await db.getFollowUpSettings();

  await cancelPendingFollowUpTask(project);
  const now = new Date();
  const scheduled = await scheduleFollowUp(project, 1, settings, now);

  await db.updateProject(project.id, {
    status: "SEGUIMIENTO",
    followUpCount: 0,
    followUpStartedAt: now,
    followUpLastAt: null,
    followUpNextNumber: scheduled.number,
    followUpNextAt: scheduled.dueAt,
    followUpTaskId: scheduled.taskId,
    followUpTaskListId: scheduled.taskListId,
  });

  return finish(project.id, settings, scheduled, {
    message: "Seguimientos reiniciados desde el #1",
  });
}

export async function runFollowUpAction(
  action: FollowUpAction,
  projectId: string,
): Promise<FollowUpActionResult> {
  switch (action) {
    case "start":
      return startFollowUps(projectId);
    case "advance":
      return advanceFollowUp(projectId);
    case "cancel":
      return cancelFollowUps(projectId);
    case "reset":
      return resetFollowUps(projectId);
  }
}

/**
 * Avanza los seguimientos cuya fecha ya pasó: al cumplirse el seguimiento N,
 * queda agendado el N+1 según la configuración.
 */
export async function syncDueFollowUps(limit = 25): Promise<number> {
  const settings = await db.getFollowUpSettings();
  const projects = await db.listProjects();
  const now = Date.now();

  const due = projects
    .filter(
      (project) =>
        !isFollowUpStopped(project.status) &&
        project.followUpNextAt != null &&
        new Date(project.followUpNextAt).getTime() <= now,
    )
    .slice(0, limit);

  let advanced = 0;
  for (const candidate of due) {
    // Relee el proyecto: el listado puede venir de caché y no queremos
    // avanzar dos veces el mismo seguimiento (crearía tareas duplicadas).
    const project = await db.getProjectById(candidate.id);
    if (
      !project ||
      isFollowUpStopped(project.status) ||
      project.followUpNextAt == null ||
      new Date(project.followUpNextAt).getTime() > now
    ) {
      continue;
    }

    const pending =
      project.followUpNextNumber ??
      clampFollowUpCount(project.followUpCount, settings.count) + 1;
    const completed = Math.min(settings.count, pending);
    const nextNumber = completed + 1;
    const passedAt = project.followUpNextAt
      ? new Date(project.followUpNextAt)
      : new Date();

    try {
      if (nextNumber > settings.count) {
        await db.updateProject(project.id, {
          followUpCount: completed,
          followUpLastAt: passedAt,
          followUpNextNumber: null,
          followUpNextAt: null,
          followUpTaskId: null,
          followUpTaskListId: null,
        });
      } else {
        const scheduled = await scheduleFollowUp(
          project,
          nextNumber,
          settings,
          passedAt,
        );
        await db.updateProject(project.id, {
          followUpCount: completed,
          followUpLastAt: passedAt,
          followUpNextNumber: scheduled.number,
          followUpNextAt: scheduled.dueAt,
          followUpTaskId: scheduled.taskId,
          followUpTaskListId: scheduled.taskListId,
        });
      }
      advanced += 1;
    } catch (error) {
      console.error(`syncDueFollowUps: ${project.id} failed`, error);
    }
  }

  return advanced;
}
