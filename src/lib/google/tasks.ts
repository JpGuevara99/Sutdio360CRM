/**
 * Google Tasks via service account + domain-wide delegation.
 * En Admin Workspace autoriza el scope Tasks para la SA.
 * Lista: GOOGLE_TASKS_LIST_ID (si no está, se usa la primera lista de la
 * cuenta impersonada). Para que aparezca en Calendar, la lista de Tasks debe
 * estar sincronizada en esa cuenta.
 */
import { google } from "googleapis";
import { getGoogleAuth, isGoogleConfigured } from "@/lib/google/auth";

export const GOOGLE_TASKS_SCOPE = "https://www.googleapis.com/auth/tasks";
const TASKS_SCOPES = [GOOGLE_TASKS_SCOPE];

async function getAuthorizedTasksClient() {
  const auth = getGoogleAuth(TASKS_SCOPES);
  // Fuerza el intercambio de token ahora, para que unauthorized_client
  // aparezca aquí (delegación) y no como un error opaco de Tasks.
  await auth.authorize();
  return google.tasks({ version: "v1", auth });
}

type GoogleErrorShape = {
  message?: string;
  code?: number | string;
  errors?: Array<{ message?: string; reason?: string }>;
  response?: {
    status?: number;
    data?: {
      error?:
        | string
        | { message?: string; status?: string; error_description?: string };
      error_description?: string;
    };
  };
};

function googleErrorParts(error: unknown): {
  code: string | number | null;
  reason: string;
  description: string | null;
} {
  const anyError = error as GoogleErrorShape;
  const data = anyError?.response?.data;
  const nested =
    typeof data?.error === "object" && data.error ? data.error : null;
  const reason =
    (typeof data?.error === "string" ? data.error : null) ??
    nested?.status ??
    nested?.message ??
    anyError?.errors?.[0]?.reason ??
    anyError?.errors?.[0]?.message ??
    anyError?.message ??
    "Error de Google Tasks";
  const description =
    (typeof data?.error_description === "string"
      ? data.error_description
      : null) ??
    nested?.error_description ??
    null;
  const code = anyError?.response?.status ?? anyError?.code ?? null;
  return { code, reason, description };
}

/**
 * Traduce el 401 unauthorized_client (el más común con Tasks) a pasos
 * accionables. Calendar/Drive pueden estar bien: Tasks es un scope extra.
 */
export function googleErrorMessage(error: unknown): string {
  const { code, reason, description } = googleErrorParts(error);
  const blob = `${reason} ${description ?? ""}`.toLowerCase();
  if (
    blob.includes("unauthorized_client") ||
    (code === 401 && blob.includes("unauthorized"))
  ) {
    const impersonate =
      process.env.GOOGLE_WORKSPACE_IMPERSONATE_EMAIL?.trim() ||
      "la cuenta impersonada";
    const sa =
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ||
      "la cuenta de servicio";
    return [
      "Google rechazó el acceso a Tasks (unauthorized_client / 401).",
      `Falta autorizar el ámbito de Tasks en la delegación de dominio para ${sa}, impersonando a ${impersonate}.`,
      "En Admin de Workspace → Seguridad → Controles de API → Delegación en todo el dominio, abre el Client ID numérico de esa cuenta de servicio (no el correo) y agrega este scope junto a Calendar y Drive:",
      GOOGLE_TASKS_SCOPE,
      "En Google Cloud del mismo proyecto, habilita “Google Tasks API”. Guarda, espera 2–5 minutos y vuelve a probar.",
    ].join(" ");
  }
  if (
    blob.includes("accessnotconfigured") ||
    blob.includes("has not been used") ||
    blob.includes("is disabled")
  ) {
    return "La Google Tasks API no está habilitada en el proyecto de Cloud de la cuenta de servicio. Actívala en console.cloud.google.com → APIs → Google Tasks API.";
  }
  const extra = description && description !== reason ? `: ${description}` : "";
  return code ? `${reason}${extra} (${code})` : `${reason}${extra}`;
}

export function getConfiguredTasksListId(): string | null {
  return process.env.GOOGLE_TASKS_LIST_ID?.trim() || null;
}

/**
 * Devuelve un id de lista utilizable. `@default` no siempre existe cuando se
 * impersona a un usuario, así que se resuelve contra las listas reales.
 */
export async function resolveTasksListId(): Promise<string> {
  const configured = getConfiguredTasksListId();
  const tasks = await getAuthorizedTasksClient();

  if (configured && configured !== "@default") {
    return configured;
  }

  const res = await tasks.tasklists.list({ maxResults: 20 });
  const lists = res.data.items ?? [];
  const first = lists.find((list) => Boolean(list.id));
  if (!first?.id) {
    throw new Error(
      "La cuenta de Google no tiene ninguna lista de Tasks disponible",
    );
  }
  return first.id;
}

export async function createGoogleTask(options: {
  title: string;
  notes?: string;
  /** Fecha de vencimiento (Tasks solo usa la parte de fecha) */
  due: Date;
}): Promise<{ taskId: string; taskListId: string }> {
  if (!isGoogleConfigured()) {
    throw new Error("Google no está configurado");
  }

  const tasks = await getAuthorizedTasksClient();
  const taskListId = await resolveTasksListId();

  // Tasks API espera due en RFC3339 y descarta la hora.
  const dueIso = new Date(
    Date.UTC(
      options.due.getUTCFullYear(),
      options.due.getUTCMonth(),
      options.due.getUTCDate(),
    ),
  ).toISOString();

  const res = await tasks.tasks.insert({
    tasklist: taskListId,
    requestBody: {
      title: options.title,
      notes: options.notes ?? undefined,
      due: dueIso,
    },
  });

  const taskId = res.data.id;
  if (!taskId) {
    throw new Error("Google Tasks no devolvió un id de tarea");
  }

  return { taskId, taskListId };
}

export async function deleteGoogleTask(options: {
  taskId: string;
  taskListId?: string | null;
}): Promise<void> {
  if (!isGoogleConfigured()) {
    throw new Error("Google no está configurado");
  }
  const tasks = await getAuthorizedTasksClient();
  const tasklist = options.taskListId?.trim() || (await resolveTasksListId());
  await tasks.tasks.delete({ tasklist, task: options.taskId });
}

export type GoogleTasksCheck = {
  ok: boolean;
  listId: string | null;
  listTitle: string | null;
  lists: number;
  createdTaskId: string | null;
  error: string | null;
};

/** Crea y borra una tarea de prueba para validar la integración. */
export async function checkGoogleTasks(options?: {
  keepTask?: boolean;
}): Promise<GoogleTasksCheck> {
  if (!isGoogleConfigured()) {
    return {
      ok: false,
      listId: null,
      listTitle: null,
      lists: 0,
      createdTaskId: null,
      error:
        "Faltan variables de entorno de Google (service account e impersonación)",
    };
  }

  try {
    const tasks = await getAuthorizedTasksClient();
    const listsRes = await tasks.tasklists.list({ maxResults: 20 });
    const lists = listsRes.data.items ?? [];
    const listId = await resolveTasksListId();
    const listTitle =
      lists.find((list) => list.id === listId)?.title ?? null;

    const due = new Date();
    due.setUTCDate(due.getUTCDate() + 1);
    const created = await createGoogleTask({
      title: "Prueba de conexión · 360 Studio CRM",
      notes: "Tarea de prueba creada desde el CRM. Puedes borrarla.",
      due,
    });

    if (!options?.keepTask) {
      await deleteGoogleTask({
        taskId: created.taskId,
        taskListId: created.taskListId,
      });
    }

    return {
      ok: true,
      listId,
      listTitle,
      lists: lists.length,
      createdTaskId: options?.keepTask ? created.taskId : null,
      error: null,
    };
  } catch (error) {
    console.error("checkGoogleTasks failed", error);
    return {
      ok: false,
      listId: getConfiguredTasksListId(),
      listTitle: null,
      lists: 0,
      createdTaskId: null,
      error: googleErrorMessage(error),
    };
  }
}
