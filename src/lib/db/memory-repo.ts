import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { createId } from "@/lib/db/serialize";
import type {
  AuditAction,
  AuditLog,
  ChileAddress,
  Client,
  ClientWithProjects,
  CompanySettings,
  FileRef,
  FollowUpSettings,
  ProjectClosingOutcome,
  Material,
  MaterialCategory,
  MaterialUnit,
  PipelineStage,
  Project,
  ProjectNote,
  ProjectStatus,
  ProjectWithRelations,
  Quote,
  QuoteCosts,
  QuoteLine,
  QuoteStatus,
  QuoteWithLines,
  QuoteWithProject,
  StaffUser,
  TrashedClient,
  TrashedProject,
  Visit,
  VisitSource,
} from "@/lib/crm/types";
import {
  CLOSED_STAGE_NAME,
  DEFAULT_PIPELINE_STAGES,
  isClosedStageName,
  sortStages,
} from "@/lib/crm/pipeline";
import {
  DEFAULT_FOLLOW_UP_SETTINGS,
  sanitizeFollowUpSettings,
} from "@/lib/crm/follow-ups";
import {
  DEFAULT_MATERIAL_CATEGORIES,
  sortMaterialCategories,
} from "@/lib/crm/material-categories";
import { buildEntityCode } from "@/lib/crm/project-codes";
import { sanitizeChileAddress } from "@/lib/crm/chile-address";
import { quoteCostsFromLines } from "@/lib/crm/quote-summary";

type StoreShape = {
  clients: Client[];
  projects: Project[];
  visits: Visit[];
  files: FileRef[];
  auditLogs: AuditLog[];
  projectNotes: ProjectNote[];
  quotes: Quote[];
  quoteLines: QuoteLine[];
  staff: StaffUser[];
  stages: PipelineStage[];
  materials: Material[];
  materialCategories: MaterialCategory[];
  projectCodeValue: number;
  leadCodeValue: number;
  calendarSyncToken: string | null;
  companySettings: CompanySettings | null;
  followUpSettings: FollowUpSettings | null;
};

const DATA_PATH = path.join(process.cwd(), ".data", "store.json");

function normalizeQuoteCosts(value: unknown): QuoteCosts | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const labor = Number(data.labor);
  const logistics = Number(data.logistics);
  const materials = Number(data.materials);
  if (
    !Number.isFinite(labor) ||
    !Number.isFinite(logistics) ||
    !Number.isFinite(materials)
  ) {
    return null;
  }
  return { labor, logistics, materials };
}

const globalStore = globalThis as unknown as {
  studio360Memory?: StoreShape;
};

function emptyStore(): StoreShape {
  return {
    clients: [],
    projects: [],
    visits: [],
    files: [],
    auditLogs: [],
    projectNotes: [],
    quotes: [],
    quoteLines: [],
    staff: [],
    stages: [],
    materials: [],
    materialCategories: [],
    projectCodeValue: 0,
    leadCodeValue: 0,
    calendarSyncToken: null,
    companySettings: null,
    followUpSettings: null,
  };
}

async function load(): Promise<StoreShape> {
  if (globalStore.studio360Memory) return globalStore.studio360Memory;
  try {
    const raw = await readFile(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoreShape;
    parsed.clients = parsed.clients.map((c) => ({
      ...c,
      leadCode: normalizeClientCode(c.leadCode || `TMP-${c.id.slice(-6)}`),
      driveFolderId: c.driveFolderId ?? null,
      driveFolderUrl: c.driveFolderUrl ?? null,
      deletedAt: c.deletedAt ? new Date(c.deletedAt) : null,
      createdAt: new Date(c.createdAt),
      updatedAt: new Date(c.updatedAt),
    }));
    if (parsed.leadCodeValue == null) parsed.leadCodeValue = 0;
    parsed.stages = (parsed.stages ?? []).map((s) => ({
      ...s,
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt),
    }));
    parsed.materials = (parsed.materials ?? []).map((m) => ({
      ...m,
      categoryId: m.categoryId ?? null,
      costPrice: Number(m.costPrice ?? 0),
      createdAt: new Date(m.createdAt),
      updatedAt: new Date(m.updatedAt),
    }));
    parsed.materialCategories = (parsed.materialCategories ?? []).map((c) => ({
      ...c,
      createdAt: new Date(c.createdAt),
      updatedAt: new Date(c.updatedAt),
    }));
    parsed.projects = parsed.projects.map((p) => {
      const createdAt = new Date(p.createdAt);
      const followUpCount = Math.max(
        0,
        Math.floor(Number(p.followUpCount ?? 0)) || 0,
      );
      const nextNumber = Number(p.followUpNextNumber);
      return {
        ...p,
        stageId: p.stageId ?? null,
        boardOrder:
          typeof p.boardOrder === "number" ? p.boardOrder : -createdAt.getTime(),
        notes: p.notes ?? null,
        followUpCount,
        followUpStartedAt: p.followUpStartedAt
          ? new Date(p.followUpStartedAt)
          : null,
        followUpLastAt: p.followUpLastAt ? new Date(p.followUpLastAt) : null,
        followUpNextNumber:
          Number.isFinite(nextNumber) && nextNumber > 0
            ? Math.floor(nextNumber)
            : null,
        followUpNextAt: p.followUpNextAt ? new Date(p.followUpNextAt) : null,
        followUpTaskId: p.followUpTaskId ?? null,
        followUpTaskListId: p.followUpTaskListId ?? null,
        closedAt: p.closedAt ? new Date(p.closedAt) : null,
        closingOutcome:
          p.closingOutcome === "APROBADO" || p.closingOutcome === "RECHAZADO"
            ? (p.closingOutcome as ProjectClosingOutcome)
            : null,
        closedQuoteId: p.closedQuoteId ?? null,
        closedAmount:
          p.closedAmount == null ? null : Number(p.closedAmount) || 0,
        deletedAt: p.deletedAt ? new Date(p.deletedAt) : null,
        deletedWithClient: Boolean(p.deletedWithClient),
        createdAt,
        updatedAt: new Date(p.updatedAt),
      };
    });
    parsed.visits = parsed.visits.map((v) => {
      const createdAt = new Date(v.createdAt);
      return {
        ...v,
        scheduledAt: new Date(v.scheduledAt),
        bookedAt: v.bookedAt ? new Date(v.bookedAt) : createdAt,
        createdAt,
        updatedAt: new Date(v.updatedAt),
      };
    });
    parsed.projectNotes = (parsed.projectNotes ?? []).map((n) => ({
      ...n,
      createdAt: new Date(n.createdAt),
      updatedAt: new Date(n.updatedAt ?? n.createdAt),
    }));
    parsed.quotes = (parsed.quotes ?? []).map((q) => ({
      ...q,
      quoteCode:
        typeof q.quoteCode === "string" && q.quoteCode.trim()
          ? q.quoteCode.trim()
          : null,
      commercialStatus:
        q.commercialStatus === "SENT" ||
        q.commercialStatus === "ACCEPTED" ||
        q.commercialStatus === "REJECTED"
          ? q.commercialStatus
          : "NONE",
      mermaPercent: Number(q.mermaPercent ?? 0),
      utilidadPercent: Number(q.utilidadPercent ?? 0),
      extraPercent: Number(q.extraPercent ?? 0),
      discountPercent: Number(q.discountPercent ?? 0),
      includeIva: Boolean(q.includeIva),
      warrantyMonths: Number(q.warrantyMonths ?? 0),
      installmentCount: Number(q.installmentCount ?? 0),
      installmentInterestFree: Boolean(q.installmentInterestFree),
      observations:
        typeof q.observations === "string" ? q.observations : "",
      showObservations: q.showObservations !== false,
      costs: normalizeQuoteCosts(q.costs),
      createdAt: new Date(q.createdAt),
      updatedAt: new Date(q.updatedAt),
    }));
    parsed.quoteLines = (parsed.quoteLines ?? []).map((l) => ({
      ...l,
      createdAt: new Date(l.createdAt),
      updatedAt: new Date(l.updatedAt),
    }));
    parsed.files = (parsed.files ?? []).map((f) => ({
      ...f,
      createdAt: new Date(f.createdAt),
    }));
    parsed.auditLogs = (parsed.auditLogs ?? []).map((a) => ({
      ...a,
      createdAt: new Date(a.createdAt),
    }));
    parsed.companySettings = parsed.companySettings
      ? {
          commercialAddress: parsed.companySettings.commercialAddress
            ? sanitizeChileAddress(parsed.companySettings.commercialAddress)
            : null,
          phone:
            typeof parsed.companySettings.phone === "string" &&
            parsed.companySettings.phone.trim()
              ? parsed.companySettings.phone.trim()
              : null,
          updatedAt: new Date(parsed.companySettings.updatedAt),
        }
      : null;
    parsed.followUpSettings = parsed.followUpSettings
      ? sanitizeFollowUpSettings(parsed.followUpSettings)
      : null;
    globalStore.studio360Memory = parsed;
    return parsed;
  } catch {
    const store = emptyStore();
    globalStore.studio360Memory = store;
    return store;
  }
}

async function save(store: StoreShape) {
  globalStore.studio360Memory = store;
  await mkdir(path.dirname(DATA_PATH), { recursive: true });
  await writeFile(DATA_PATH, JSON.stringify(store, null, 2), "utf8");
}

function preferPersonName(incoming: string, current: string): string {
  const next = (incoming || "").trim();
  const prev = (current || "").trim();
  if (!next) return prev;
  if (/^studio\s*360$/i.test(next)) return prev || next;
  if (/^studio\s*360$/i.test(prev)) return next;
  return next || prev;
}

function normalizeClientCode(code: string): string {
  if (code.startsWith("L-")) return `C-${code.slice(2)}`;
  return code;
}

export async function nextPublicCode(): Promise<string> {
  const store = await load();
  store.projectCodeValue += 1;
  await save(store);
  return buildEntityCode("P", store.projectCodeValue);
}

export async function nextLeadCode(): Promise<string> {
  const store = await load();
  store.leadCodeValue += 1;
  await save(store);
  return buildEntityCode("C", store.leadCodeValue);
}

export async function upsertClient(input: {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}): Promise<Client> {
  const store = await load();
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() || null;
  const active = store.clients.filter((c) => !c.deletedAt);
  const existing =
    (email && active.find((c) => c.email === email)) ||
    (phone && active.find((c) => c.phone === phone)) ||
    null;

  if (existing) {
    existing.firstName = preferPersonName(input.firstName, existing.firstName);
    existing.lastName = preferPersonName(
      input.lastName,
      existing.lastName || "",
    );
    existing.phone = phone || existing.phone;
    existing.email = email || existing.email;
    existing.address = input.address || existing.address;
    if (!existing.leadCode || existing.leadCode.startsWith("TMP-")) {
      existing.leadCode = await nextLeadCode();
    }
    existing.updatedAt = new Date();
    await save(store);
    return existing;
  }

  const client: Client = {
    id: createId("cli"),
    leadCode: await nextLeadCode(),
    firstName: input.firstName,
    lastName: input.lastName,
    email,
    phone,
    address: input.address ?? null,
    driveFolderId: null,
    driveFolderUrl: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.clients.push(client);
  await save(store);
  return client;
}

export async function updateClient(
  id: string,
  data: Partial<{
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    driveFolderId: string | null;
    driveFolderUrl: string | null;
  }>,
): Promise<Client> {
  const store = await load();
  const client = store.clients.find((c) => c.id === id);
  if (!client) throw new Error("Client not found");
  if (data.firstName !== undefined) {
    client.firstName = preferPersonName(data.firstName, client.firstName);
  }
  if (data.lastName !== undefined) {
    client.lastName = preferPersonName(data.lastName || "", client.lastName);
  }
  if (data.email !== undefined) {
    client.email = data.email?.trim() || null;
  }
  if (data.phone !== undefined) {
    client.phone = data.phone?.trim() || null;
  }
  if (data.address !== undefined) {
    client.address = data.address?.trim() || null;
  }
  if (data.driveFolderId !== undefined) {
    client.driveFolderId = data.driveFolderId;
  }
  if (data.driveFolderUrl !== undefined) {
    client.driveFolderUrl = data.driveFolderUrl;
  }
  // Códigos permanentes no se reasignan aquí. Solo L- → C- (mismo número).
  if (client.leadCode.startsWith("L-")) {
    client.leadCode = normalizeClientCode(client.leadCode);
  }
  client.updatedAt = new Date();
  await save(store);
  return client;
}

export async function promoteTemporaryLeadCode(id: string): Promise<Client> {
  const store = await load();
  const client = store.clients.find((c) => c.id === id);
  if (!client) throw new Error("Client not found");
  if (client.leadCode && !client.leadCode.startsWith("TMP-")) {
    client.leadCode = normalizeClientCode(client.leadCode);
    client.updatedAt = new Date();
    await save(store);
    return client;
  }
  client.leadCode = await nextLeadCode();
  client.updatedAt = new Date();
  await save(store);
  return client;
}

export async function setClientLeadCode(
  id: string,
  leadCode: string,
): Promise<Client> {
  const store = await load();
  const client = store.clients.find((c) => c.id === id);
  if (!client) throw new Error("Client not found");
  client.leadCode = leadCode;
  client.updatedAt = new Date();
  await save(store);
  return client;
}

export async function setProjectPublicCode(
  id: string,
  publicCode: string,
): Promise<Project> {
  const store = await load();
  const project = store.projects.find((p) => p.id === id);
  if (!project) throw new Error("Project not found");
  project.publicCode = publicCode;
  project.updatedAt = new Date();
  await save(store);
  return project;
}

export async function setCodeSequences(options: {
  projectValue: number;
  leadValue: number;
}): Promise<void> {
  const store = await load();
  store.projectCodeValue = options.projectValue;
  store.leadCodeValue = options.leadValue;
  await save(store);
}

export async function updateVisitNotes(
  visitId: string,
  notes: string | null,
): Promise<void> {
  const store = await load();
  const visit = store.visits.find((v) => v.id === visitId);
  if (!visit) return;
  visit.notes = notes;
  visit.updatedAt = new Date();
  await save(store);
}

export async function updateVisit(
  visitId: string,
  data: Partial<Pick<Visit, "bookedAt" | "scheduledAt" | "notes">>,
): Promise<void> {
  const store = await load();
  const visit = store.visits.find((v) => v.id === visitId);
  if (!visit) return;
  Object.assign(visit, data, { updatedAt: new Date() });
  await save(store);
}

export async function getClientById(id: string): Promise<Client | null> {
  const store = await load();
  return store.clients.find((c) => c.id === id) ?? null;
}

export async function listClients(): Promise<ClientWithProjects[]> {
  const store = await load();
  return store.clients
    .filter((client) => !client.deletedAt)
    .map((client) => {
      const projects = store.projects
        .filter((p) => p.clientId === client.id && !p.deletedAt)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return {
        ...client,
        projects: projects.slice(0, 5),
        projectCount: projects.length,
      };
    })
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function getClientWithProjects(
  id: string,
): Promise<ClientWithProjects | null> {
  const client = await getClientById(id);
  if (!client) return null;
  const store = await load();
  const projects = store.projects
    .filter((p) => p.clientId === id && !p.deletedAt)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return { ...client, projects, projectCount: projects.length };
}

export async function deleteClient(id: string): Promise<void> {
  const store = await load();
  const stillHas = store.projects.some(
    (p) => p.clientId === id && !p.deletedAt,
  );
  if (stillHas) {
    throw new Error("Client still has projects");
  }
  store.clients = store.clients.filter((c) => c.id !== id);
  await save(store);
}

export async function setProjectTrashed(
  id: string,
  input: { deletedAt: Date | null; deletedWithClient?: boolean },
): Promise<Project> {
  const store = await load();
  const project = store.projects.find((p) => p.id === id);
  if (!project) throw new Error("Project not found");
  project.deletedAt = input.deletedAt;
  project.deletedWithClient = input.deletedAt
    ? Boolean(input.deletedWithClient)
    : false;
  project.updatedAt = new Date();
  await save(store);
  return project;
}

export async function setClientTrashed(
  id: string,
  deletedAt: Date | null,
): Promise<Client> {
  const store = await load();
  const client = store.clients.find((c) => c.id === id);
  if (!client) throw new Error("Client not found");
  client.deletedAt = deletedAt;
  client.updatedAt = new Date();
  await save(store);
  return client;
}

export async function listProjectsByClientId(
  clientId: string,
  options?: { includeDeleted?: boolean },
): Promise<Project[]> {
  const store = await load();
  return store.projects
    .filter(
      (p) =>
        p.clientId === clientId &&
        (options?.includeDeleted ? true : !p.deletedAt),
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function listTrashedProjects(): Promise<TrashedProject[]> {
  const store = await load();
  return store.projects
    .filter((p) => Boolean(p.deletedAt))
    .sort(
      (a, b) => (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0),
    )
    .map((project) => ({
      ...project,
      client: store.clients.find((c) => c.id === project.clientId) ?? null,
    }));
}

export async function listTrashedClients(): Promise<TrashedClient[]> {
  const store = await load();
  return store.clients
    .filter((c) => Boolean(c.deletedAt))
    .sort(
      (a, b) => (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0),
    )
    .map((client) => ({
      ...client,
      projects: store.projects
        .filter((p) => p.clientId === client.id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    }));
}

export async function hardDeleteProject(id: string): Promise<void> {
  const store = await load();
  const quoteIds = store.quotes
    .filter((q) => q.projectId === id)
    .map((q) => q.id);
  store.quoteLines = store.quoteLines.filter(
    (l) => !quoteIds.includes(l.quoteId),
  );
  store.quotes = store.quotes.filter((q) => q.projectId !== id);
  store.projectNotes = store.projectNotes.filter((n) => n.projectId !== id);
  store.visits = store.visits.filter((v) => v.projectId !== id);
  store.files = store.files.filter((f) => f.projectId !== id);
  store.projects = store.projects.filter((p) => p.id !== id);
  await save(store);
}

export async function hardDeleteClient(id: string): Promise<void> {
  const store = await load();
  store.clients = store.clients.filter((c) => c.id !== id);
  await save(store);
}

export async function createProject(input: {
  publicCode: string;
  clientId: string;
  status?: ProjectStatus;
  stageId?: string | null;
  title?: string | null;
  calendarEventId?: string | null;
  driveFolderId?: string | null;
  driveFolderUrl?: string | null;
  driveSyncPending?: boolean;
}): Promise<Project> {
  const stageId = input.stageId ?? (await getFirstPipelineStageId());
  const store = await load();
  const now = new Date();
  const project: Project = {
    id: createId("prj"),
    publicCode: input.publicCode,
    clientId: input.clientId,
    status: input.status ?? "RESERVADO",
    stageId,
    boardOrder: -now.getTime(),
    title: input.title ?? null,
    notes: null,
    calendarEventId: input.calendarEventId ?? null,
    driveFolderId: input.driveFolderId ?? null,
    driveFolderUrl: input.driveFolderUrl ?? null,
    driveSyncPending: input.driveSyncPending ?? false,
    followUpCount: 0,
    followUpStartedAt: null,
    followUpLastAt: null,
    followUpNextNumber: null,
    followUpNextAt: null,
    followUpTaskId: null,
    followUpTaskListId: null,
    closedAt: null,
    closingOutcome: null,
    closedQuoteId: null,
    closedAmount: null,
    deletedAt: null,
    deletedWithClient: false,
    createdAt: now,
    updatedAt: now,
  };
  store.projects.push(project);
  await save(store);
  return project;
}

export async function reorderProjectsInStage(
  stageId: string,
  orderedIds: string[],
  status?: Project["status"],
): Promise<void> {
  const store = await load();
  const now = new Date();
  orderedIds.forEach((id, index) => {
    const project = store.projects.find((p) => p.id === id);
    if (project) {
      const previousStageId = project.stageId;
      project.stageId = stageId;
      project.boardOrder = index;
      if (status && previousStageId !== stageId) {
        project.status = status;
      }
      project.updatedAt = now;
    }
  });
  await save(store);
}

export async function updateProject(
  id: string,
  data: Partial<
    Pick<
      Project,
      | "clientId"
      | "status"
      | "stageId"
      | "boardOrder"
      | "title"
      | "notes"
      | "driveFolderId"
      | "driveFolderUrl"
      | "driveSyncPending"
      | "calendarEventId"
      | "followUpCount"
      | "followUpStartedAt"
      | "followUpLastAt"
      | "followUpNextNumber"
      | "followUpNextAt"
      | "followUpTaskId"
      | "followUpTaskListId"
      | "closedAt"
      | "closingOutcome"
      | "closedQuoteId"
      | "closedAmount"
    >
  >,
): Promise<Project> {
  const store = await load();
  const project = store.projects.find((p) => p.id === id);
  if (!project) throw new Error("Project not found");
  Object.assign(project, data, { updatedAt: new Date() });
  await save(store);
  return project;
}

async function withRelations(project: Project): Promise<ProjectWithRelations | null> {
  const store = await load();
  const client = store.clients.find((c) => c.id === project.clientId);
  if (!client) return null;
  const visits = store.visits
    .filter((v) => v.projectId === project.id)
    .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());
  const files = store.files
    .filter((f) => f.projectId === project.id)
    .map((f) => ({
      ...f,
      mimeType: f.mimeType ?? null,
      webViewLink: f.webViewLink ?? null,
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const projectNotes = await listProjectNotes(project.id);
  return { ...project, client, visits, files, projectNotes };
}

export async function listProjectNotes(
  projectId: string,
): Promise<ProjectNote[]> {
  const store = await load();
  let notes = store.projectNotes
    .filter((n) => n.projectId === projectId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  if (notes.length === 0) {
    const project = store.projects.find((p) => p.id === projectId);
    const legacy = project?.notes?.trim() ?? "";
    if (legacy) {
      const migrated = await createProjectNote({ projectId, body: legacy });
      const storeAfter = await load();
      const projectAfter = storeAfter.projects.find((p) => p.id === projectId);
      if (projectAfter) {
        projectAfter.notes = null;
        projectAfter.updatedAt = new Date();
        await save(storeAfter);
      }
      notes = [migrated];
    }
  }

  return notes;
}

export async function createProjectNote(input: {
  projectId: string;
  body: string;
}): Promise<ProjectNote> {
  const store = await load();
  const now = new Date();
  const note: ProjectNote = {
    id: createId("note"),
    projectId: input.projectId,
    body: input.body.trim(),
    createdAt: now,
    updatedAt: now,
  };
  store.projectNotes.push(note);
  await save(store);
  return note;
}

export async function updateProjectNote(
  noteId: string,
  body: string,
): Promise<ProjectNote> {
  const store = await load();
  const note = store.projectNotes.find((n) => n.id === noteId);
  if (!note) throw new Error("Note not found");
  const now = new Date();
  note.body = body.trim();
  note.createdAt = now;
  note.updatedAt = now;
  await save(store);
  return note;
}

export async function deleteProjectNote(noteId: string): Promise<void> {
  const store = await load();
  store.projectNotes = store.projectNotes.filter((n) => n.id !== noteId);
  await save(store);
}

export async function getProjectNoteById(
  noteId: string,
): Promise<ProjectNote | null> {
  const store = await load();
  return store.projectNotes.find((n) => n.id === noteId) ?? null;
}

/** Referencia registrada en el CRM para un archivo de Drive (o null). */
export async function getFileRefByDriveFileId(
  driveFileId: string,
): Promise<FileRef | null> {
  const store = await load();
  return store.files.find((f) => f.driveFileId === driveFileId) ?? null;
}

export async function createAuditLog(input: {
  action: AuditAction;
  actorEmail: string;
  target?: string | null;
  detail?: string | null;
}): Promise<AuditLog> {
  const store = await load();
  const entry: AuditLog = {
    id: createId("audit"),
    action: input.action,
    actorEmail: input.actorEmail,
    target: input.target ?? null,
    detail: input.detail ?? null,
    createdAt: new Date(),
  };
  store.auditLogs.push(entry);
  await save(store);
  return entry;
}

export async function listAuditLogs(limit = 100): Promise<AuditLog[]> {
  const store = await load();
  return [...store.auditLogs]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

export async function createFileRef(input: {
  projectId: string;
  driveFileId: string;
  kind: import("@/lib/crm/types").FileKind;
  name: string;
  mimeType?: string | null;
  webViewLink?: string | null;
}): Promise<FileRef> {
  const store = await load();
  const file: FileRef = {
    id: createId("file"),
    projectId: input.projectId,
    driveFileId: input.driveFileId,
    kind: input.kind,
    name: input.name,
    mimeType: input.mimeType ?? null,
    webViewLink: input.webViewLink ?? null,
    createdAt: new Date(),
  };
  store.files.push(file);
  await save(store);
  return file;
}

export async function getProjectById(
  id: string,
): Promise<ProjectWithRelations | null> {
  const store = await load();
  const project = store.projects.find((p) => p.id === id);
  if (!project) return null;
  return withRelations(project);
}

export async function getProjectByCalendarEventId(
  calendarEventId: string,
): Promise<ProjectWithRelations | null> {
  const store = await load();
  const project = store.projects.find(
    (p) => p.calendarEventId === calendarEventId,
  );
  if (!project) return null;
  return withRelations(project);
}

export async function listProjects(options?: {
  status?: ProjectStatus;
}): Promise<ProjectWithRelations[]> {
  const store = await load();
  const projects = store.projects
    .filter((p) => !p.deletedAt)
    .filter((p) => (options?.status ? p.status === options.status : true))
    .sort((a, b) => {
      if (a.boardOrder !== b.boardOrder) return a.boardOrder - b.boardOrder;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  const result: ProjectWithRelations[] = [];
  for (const project of projects) {
    const full = await withRelations(project);
    if (full) result.push(full);
  }
  return result;
}

export async function createVisit(input: {
  projectId: string;
  scheduledAt: Date;
  bookedAt?: Date;
  durationMin?: number;
  timezone?: string;
  source: VisitSource;
  notes?: string | null;
}): Promise<Visit> {
  const store = await load();
  const now = new Date();
  const visit: Visit = {
    id: createId("vis"),
    projectId: input.projectId,
    scheduledAt: input.scheduledAt,
    bookedAt: input.bookedAt ?? now,
    durationMin: input.durationMin ?? 60,
    timezone: input.timezone ?? "America/Santiago",
    source: input.source,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  };
  store.visits.push(visit);
  await save(store);
  return visit;
}

export async function countVisitsBetween(
  start: Date,
  end: Date,
): Promise<number> {
  const store = await load();
  return store.visits.filter(
    (v) =>
      v.scheduledAt.getTime() >= start.getTime() &&
      v.scheduledAt.getTime() <= end.getTime(),
  ).length;
}

export async function countProjectsByStatus(
  status: ProjectStatus,
): Promise<number> {
  const store = await load();
  return store.projects.filter((p) => p.status === status && !p.deletedAt)
    .length;
}

export async function listPendingDriveProjects(): Promise<Project[]> {
  const store = await load();
  return store.projects
    .filter((p) => p.driveSyncPending && !p.deletedAt)
    .slice(0, 50);
}

export async function getCompanySettings(): Promise<CompanySettings> {
  const store = await load();
  return (
    store.companySettings ?? {
      commercialAddress: null,
      phone: null,
      updatedAt: new Date(0),
    }
  );
}

export async function updateCompanySettings(input: {
  commercialAddress?: ChileAddress | null;
  phone?: string | null;
}): Promise<CompanySettings> {
  const store = await load();
  const existing = store.companySettings ?? {
    commercialAddress: null,
    phone: null,
    updatedAt: new Date(0),
  };
  const commercialAddress =
    input.commercialAddress !== undefined
      ? input.commercialAddress
        ? sanitizeChileAddress(input.commercialAddress)
        : null
      : existing.commercialAddress;
  const phone =
    input.phone !== undefined
      ? input.phone?.trim() || null
      : existing.phone;
  const next: CompanySettings = {
    commercialAddress:
      commercialAddress &&
      (commercialAddress.street ||
        commercialAddress.number ||
        commercialAddress.commune ||
        commercialAddress.region)
        ? commercialAddress
        : null,
    phone,
    updatedAt: new Date(),
  };
  store.companySettings = next;
  await save(store);
  return next;
}

export async function getFollowUpSettings(): Promise<FollowUpSettings> {
  const store = await load();
  return store.followUpSettings ?? DEFAULT_FOLLOW_UP_SETTINGS;
}

export async function updateFollowUpSettings(input: {
  count: number;
  intervalDays: number[];
}): Promise<FollowUpSettings> {
  const store = await load();
  const next = sanitizeFollowUpSettings({
    count: input.count,
    intervalDays: input.intervalDays,
    updatedAt: new Date(),
  });
  store.followUpSettings = next;
  await save(store);
  return next;
}

export async function getCalendarSyncToken(): Promise<string | null> {
  const store = await load();
  return store.calendarSyncToken;
}

export async function setCalendarSyncToken(syncToken: string): Promise<void> {
  const store = await load();
  store.calendarSyncToken = syncToken;
  await save(store);
}

export async function upsertStaffUser(input: {
  firebaseUid: string;
  email: string;
  displayName?: string | null;
}): Promise<StaffUser> {
  const store = await load();
  const existing = store.staff.find((s) => s.firebaseUid === input.firebaseUid);
  if (existing) {
    existing.email = input.email;
    existing.displayName = input.displayName ?? existing.displayName;
    existing.updatedAt = new Date();
    await save(store);
    return existing;
  }
  const staff: StaffUser = {
    id: input.firebaseUid,
    firebaseUid: input.firebaseUid,
    email: input.email,
    displayName: input.displayName ?? null,
    role: "COMERCIAL",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.staff.push(staff);
  await save(store);
  return staff;
}

export async function listPipelineStages(): Promise<PipelineStage[]> {
  const store = await load();
  if (store.stages.length === 0) {
    return ensureDefaultPipelineStages();
  }
  if (!store.stages.some((s) => isClosedStageName(s.name))) {
    const now = new Date();
    store.stages.push({
      id: createId("stg"),
      name: CLOSED_STAGE_NAME,
      order: store.stages.length,
      createdAt: now,
      updatedAt: now,
    });
    await save(store);
  }
  const stages = sortStages(store.stages);
  const firstId = stages[0]?.id ?? null;
  if (firstId) {
    let changed = false;
    for (const project of store.projects) {
      if (!project.stageId) {
        project.stageId = firstId;
        changed = true;
      }
    }
    if (changed) await save(store);
  }
  return stages;
}

export async function ensureDefaultPipelineStages(): Promise<PipelineStage[]> {
  const store = await load();
  if (store.stages.length > 0) return sortStages(store.stages);
  const now = new Date();
  store.stages = DEFAULT_PIPELINE_STAGES.map((name, index) => ({
    id: createId("stg"),
    name,
    order: index,
    createdAt: now,
    updatedAt: now,
  }));
  const firstId = store.stages[0]?.id ?? null;
  if (firstId) {
    for (const project of store.projects) {
      if (!project.stageId) project.stageId = firstId;
    }
  }
  await save(store);
  return store.stages;
}

export async function getFirstPipelineStageId(): Promise<string | null> {
  const stages = await listPipelineStages();
  return stages[0]?.id ?? null;
}

export async function createPipelineStage(input: {
  name: string;
}): Promise<PipelineStage> {
  const store = await load();
  await listPipelineStages();
  const stage: PipelineStage = {
    id: createId("stg"),
    name: input.name.trim(),
    order: store.stages.length,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.stages.push(stage);
  await save(store);
  return stage;
}

export async function updatePipelineStage(
  id: string,
  data: Partial<Pick<PipelineStage, "name" | "order">>,
): Promise<PipelineStage> {
  const store = await load();
  const stage = store.stages.find((s) => s.id === id);
  if (!stage) throw new Error("Stage not found");
  if (data.name !== undefined && isClosedStageName(stage.name)) {
    throw new Error("La etapa Cerrado es fija y no se puede renombrar");
  }
  if (data.name !== undefined) stage.name = data.name.trim();
  if (data.order !== undefined) stage.order = data.order;
  stage.updatedAt = new Date();
  await save(store);
  return stage;
}

export async function deletePipelineStage(id: string): Promise<void> {
  const store = await load();
  if (store.stages.length <= 1) {
    throw new Error("Debe existir al menos una etapa en el pipeline");
  }
  const target = store.stages.find((s) => s.id === id);
  if (target && isClosedStageName(target.name)) {
    throw new Error("La etapa Cerrado es fija y no se puede eliminar");
  }
  const fallback = store.stages.find((s) => s.id !== id);
  if (!fallback) throw new Error("No hay etapa de destino");
  for (const project of store.projects) {
    if (project.stageId === id) project.stageId = fallback.id;
  }
  store.stages = store.stages.filter((s) => s.id !== id);
  store.stages
    .sort((a, b) => a.order - b.order)
    .forEach((stage, index) => {
      stage.order = index;
    });
  await save(store);
}

export async function reorderPipelineStages(
  orderedIds: string[],
): Promise<PipelineStage[]> {
  const store = await load();
  // "Cerrado" queda siempre al final, sin importar el orden recibido.
  const closedIds = store.stages
    .filter((s) => isClosedStageName(s.name))
    .map((s) => s.id);
  const finalOrder = [
    ...orderedIds.filter((id) => !closedIds.includes(id)),
    ...closedIds,
  ];
  finalOrder.forEach((id, index) => {
    const stage = store.stages.find((s) => s.id === id);
    if (stage) {
      stage.order = index;
      stage.updatedAt = new Date();
    }
  });
  await save(store);
  return sortStages(store.stages);
}

export async function listMaterialCategories(): Promise<MaterialCategory[]> {
  const store = await load();
  if (store.materialCategories.length === 0) {
    return ensureDefaultMaterialCategories();
  }
  return sortMaterialCategories(store.materialCategories);
}

export async function ensureDefaultMaterialCategories(): Promise<
  MaterialCategory[]
> {
  const store = await load();
  if (store.materialCategories.length > 0) {
    return sortMaterialCategories(store.materialCategories);
  }
  const now = new Date();
  store.materialCategories = DEFAULT_MATERIAL_CATEGORIES.map((name, index) => ({
    id: createId("mcg"),
    name,
    order: index,
    createdAt: now,
    updatedAt: now,
  }));
  await save(store);
  return store.materialCategories;
}

export async function createMaterialCategory(input: {
  name: string;
}): Promise<MaterialCategory> {
  const store = await load();
  await listMaterialCategories();
  const category: MaterialCategory = {
    id: createId("mcg"),
    name: input.name.trim(),
    order: store.materialCategories.length,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.materialCategories.push(category);
  await save(store);
  return category;
}

export async function updateMaterialCategory(
  id: string,
  data: Partial<Pick<MaterialCategory, "name" | "order">>,
): Promise<MaterialCategory> {
  const store = await load();
  const category = store.materialCategories.find((c) => c.id === id);
  if (!category) throw new Error("Category not found");
  if (data.name !== undefined) category.name = data.name.trim();
  if (data.order !== undefined) category.order = data.order;
  category.updatedAt = new Date();
  await save(store);
  return category;
}

export async function deleteMaterialCategory(id: string): Promise<void> {
  const store = await load();
  if (store.materialCategories.length <= 1) {
    throw new Error("Debe existir al menos una categoría");
  }
  const fallback = store.materialCategories.find((c) => c.id !== id);
  if (!fallback) throw new Error("No hay categoría de destino");
  for (const material of store.materials) {
    if (material.categoryId === id) material.categoryId = fallback.id;
  }
  store.materialCategories = store.materialCategories.filter((c) => c.id !== id);
  store.materialCategories
    .sort((a, b) => a.order - b.order)
    .forEach((category, index) => {
      category.order = index;
    });
  await save(store);
}

export async function listMaterials(): Promise<Material[]> {
  await listMaterialCategories();
  const store = await load();
  return [...store.materials].sort((a, b) =>
    a.name.localeCompare(b.name, "es"),
  );
}

export async function createMaterial(input: {
  name: string;
  categoryId?: string | null;
  unit: MaterialUnit;
  costPrice: number;
}): Promise<Material> {
  const categories = await listMaterialCategories();
  const store = await load();
  const material: Material = {
    id: createId("mat"),
    name: input.name.trim(),
    categoryId: input.categoryId ?? categories[0]?.id ?? null,
    unit: input.unit,
    costPrice: input.costPrice,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.materials.push(material);
  await save(store);
  return material;
}

export async function createMaterials(
  inputs: Array<{
    name: string;
    categoryId?: string | null;
    unit: MaterialUnit;
    costPrice: number;
  }>,
): Promise<Material[]> {
  if (inputs.length === 0) return [];
  const categories = await listMaterialCategories();
  const store = await load();
  const fallbackCategoryId = categories[0]?.id ?? null;
  const now = new Date();
  const created: Material[] = inputs.map((input) => ({
    id: createId("mat"),
    name: input.name.trim(),
    categoryId: input.categoryId ?? fallbackCategoryId,
    unit: input.unit,
    costPrice: input.costPrice,
    createdAt: now,
    updatedAt: now,
  }));
  store.materials.push(...created);
  await save(store);
  return created;
}

export async function updateMaterial(
  id: string,
  data: Partial<Pick<Material, "name" | "categoryId" | "unit" | "costPrice">>,
): Promise<Material> {
  const store = await load();
  const material = store.materials.find((m) => m.id === id);
  if (!material) throw new Error("Material not found");
  if (data.name !== undefined) material.name = data.name.trim();
  if (data.categoryId !== undefined) material.categoryId = data.categoryId;
  if (data.unit !== undefined) material.unit = data.unit;
  if (data.costPrice !== undefined) material.costPrice = data.costPrice;
  material.updatedAt = new Date();
  await save(store);
  return material;
}

export async function deleteMaterial(id: string): Promise<void> {
  const store = await load();
  store.materials = store.materials.filter((m) => m.id !== id);
  await save(store);
}

export async function deleteAllMaterials(): Promise<number> {
  const store = await load();
  const count = store.materials.length;
  store.materials = [];
  await save(store);
  return count;
}

export async function listQuotesByProject(
  projectId: string,
): Promise<Quote[]> {
  const store = await load();
  return store.quotes
    .filter((q) => q.projectId === projectId)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function listRecentQuotes(
  limit = 50,
): Promise<QuoteWithProject[]> {
  const store = await load();
  const liveProjectIds = new Set(
    store.projects.filter((p) => !p.deletedAt).map((p) => p.id),
  );
  const quotes = [...store.quotes]
    .filter((q) => liveProjectIds.has(q.projectId))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, limit);
  const result: QuoteWithProject[] = [];
  for (const quote of quotes) {
    const project = await getProjectById(quote.projectId);
    if (!project) continue;
    result.push({ ...quote, project, client: project.client });
  }
  return result;
}

export async function listAllQuotes(): Promise<Quote[]> {
  const store = await load();
  return [...store.quotes].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
}

export async function listAllQuoteLines(): Promise<QuoteLine[]> {
  const store = await load();
  return [...store.quoteLines];
}

/** Líneas de un conjunto acotado de cotizaciones (evita leer la colección). */
export async function listQuoteLinesByQuoteIds(
  quoteIds: string[],
): Promise<QuoteLine[]> {
  if (quoteIds.length === 0) return [];
  const store = await load();
  const wanted = new Set(quoteIds);
  return store.quoteLines.filter((line) => wanted.has(line.quoteId));
}

export async function getQuoteById(
  quoteId: string,
): Promise<QuoteWithLines | null> {
  const store = await load();
  const quote = store.quotes.find((q) => q.id === quoteId);
  if (!quote) return null;
  const lines = store.quoteLines
    .filter((l) => l.quoteId === quoteId)
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime(),
    );
  return { ...quote, lines };
}

export async function getQuoteByCode(
  code: string,
): Promise<QuoteWithProject | null> {
  const normalized = code.trim().replace(/^#/, "").toUpperCase();
  if (!normalized) return null;
  const store = await load();
  const quote = store.quotes.find(
    (q) =>
      q.quoteCode &&
      q.quoteCode.trim().replace(/^#/, "").toUpperCase() === normalized,
  );
  if (!quote) return null;
  const project = await getProjectById(quote.projectId);
  if (!project) return null;
  return { ...quote, project, client: project.client };
}

export async function createQuote(input: {
  projectId: string;
  title?: string;
  quoteCode?: string;
}): Promise<Quote> {
  const store = await load();
  const now = new Date();
  const quoteCode = input.quoteCode?.trim() || null;
  const quote: Quote = {
    id: createId("quote"),
    projectId: input.projectId,
    quoteCode,
    title:
      input.title?.trim() ||
      (quoteCode ? `Cotización #${quoteCode}` : "Presupuesto de costos"),
    status: "DRAFT",
    commercialStatus: "NONE",
    mermaPercent: 0,
    utilidadPercent: 0,
    extraPercent: 0,
    discountPercent: 0,
    includeIva: false,
    warrantyMonths: 0,
    installmentCount: 0,
    installmentInterestFree: false,
    observations: "",
    showObservations: true,
    costs: { labor: 0, logistics: 0, materials: 0 },
    createdAt: now,
    updatedAt: now,
  };
  store.quotes.push(quote);
  await save(store);
  return quote;
}

/** Recalcula y guarda los costos de la cotización desde sus líneas. */
export async function setQuoteCosts(
  quoteId: string,
  costs: QuoteCosts,
): Promise<void> {
  const store = await load();
  const quote = store.quotes.find((q) => q.id === quoteId);
  if (!quote) return;
  quote.costs = costs;
  await save(store);
}

function refreshQuoteCosts(store: StoreShape, quoteId: string) {
  const quote = store.quotes.find((q) => q.id === quoteId);
  if (!quote) return;
  quote.costs = quoteCostsFromLines(
    store.quoteLines.filter((l) => l.quoteId === quoteId),
  );
}

export async function updateQuote(
  quoteId: string,
  data: Partial<
    Pick<
      Quote,
      | "title"
      | "status"
      | "commercialStatus"
      | "mermaPercent"
      | "utilidadPercent"
      | "extraPercent"
      | "discountPercent"
      | "includeIva"
      | "warrantyMonths"
      | "installmentCount"
      | "installmentInterestFree"
      | "observations"
      | "showObservations"
    >
  >,
): Promise<Quote> {
  const store = await load();
  const quote = store.quotes.find((q) => q.id === quoteId);
  if (!quote) throw new Error("Quote not found");
  if (data.title !== undefined) quote.title = data.title.trim();
  if (data.status !== undefined) quote.status = data.status;
  if (data.commercialStatus !== undefined) {
    quote.commercialStatus = data.commercialStatus;
  }
  if (data.mermaPercent !== undefined) quote.mermaPercent = data.mermaPercent;
  if (data.utilidadPercent !== undefined) {
    quote.utilidadPercent = data.utilidadPercent;
  }
  if (data.extraPercent !== undefined) quote.extraPercent = data.extraPercent;
  if (data.discountPercent !== undefined) {
    quote.discountPercent = data.discountPercent;
  }
  if (data.includeIva !== undefined) quote.includeIva = data.includeIva;
  if (data.warrantyMonths !== undefined) {
    quote.warrantyMonths = data.warrantyMonths;
  }
  if (data.installmentCount !== undefined) {
    quote.installmentCount = data.installmentCount;
  }
  if (data.installmentInterestFree !== undefined) {
    quote.installmentInterestFree = data.installmentInterestFree;
  }
  if (data.observations !== undefined) {
    quote.observations = data.observations;
  }
  if (data.showObservations !== undefined) {
    quote.showObservations = data.showObservations;
  }
  quote.updatedAt = new Date();
  await save(store);
  return quote;
}

export async function deleteQuote(quoteId: string): Promise<void> {
  const store = await load();
  store.quotes = store.quotes.filter((q) => q.id !== quoteId);
  store.quoteLines = store.quoteLines.filter((l) => l.quoteId !== quoteId);
  await save(store);
}

export async function addQuoteLines(input: {
  quoteId: string;
  materials: Array<{
    materialId: string;
    name: string;
    categoryId: string | null;
    categoryName: string;
    unit: MaterialUnit;
    unitCost: number;
    quantity?: number;
  }>;
}): Promise<QuoteLine[]> {
  const store = await load();
  const existing = store.quoteLines.filter((l) => l.quoteId === input.quoteId);
  let sortOrder = existing.length;
  const now = new Date();
  const created: QuoteLine[] = [];
  const existingIds = new Set(existing.map((l) => l.materialId));

  for (const material of input.materials) {
    if (existingIds.has(material.materialId)) continue;
    const line: QuoteLine = {
      id: createId("qline"),
      quoteId: input.quoteId,
      materialId: material.materialId,
      name: material.name,
      categoryId: material.categoryId,
      categoryName: material.categoryName,
      unit: material.unit,
      unitCost: material.unitCost,
      quantity: material.quantity ?? 1,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    };
    store.quoteLines.push(line);
    created.push(line);
    sortOrder += 1;
  }

  const quote = store.quotes.find((q) => q.id === input.quoteId);
  if (quote) quote.updatedAt = now;
  refreshQuoteCosts(store, input.quoteId);
  await save(store);
  return created;
}

export async function updateQuoteLine(
  lineId: string,
  data: Partial<Pick<QuoteLine, "quantity" | "sortOrder" | "unitCost" | "unit">>,
): Promise<QuoteLine> {
  const store = await load();
  const line = store.quoteLines.find((l) => l.id === lineId);
  if (!line) throw new Error("Quote line not found");
  if (data.quantity !== undefined) line.quantity = data.quantity;
  if (data.sortOrder !== undefined) line.sortOrder = data.sortOrder;
  if (data.unitCost !== undefined) line.unitCost = data.unitCost;
  if (data.unit !== undefined) line.unit = data.unit;
  line.updatedAt = new Date();
  const quote = store.quotes.find((q) => q.id === line.quoteId);
  if (quote) quote.updatedAt = line.updatedAt;
  refreshQuoteCosts(store, line.quoteId);
  await save(store);
  return line;
}

export async function deleteQuoteLine(lineId: string): Promise<void> {
  const store = await load();
  const line = store.quoteLines.find((l) => l.id === lineId);
  if (!line) return;
  store.quoteLines = store.quoteLines.filter((l) => l.id !== lineId);
  const quote = store.quotes.find((q) => q.id === line.quoteId);
  if (quote) quote.updatedAt = new Date();
  refreshQuoteCosts(store, line.quoteId);
  await save(store);
}

export async function getQuoteLineById(
  lineId: string,
): Promise<QuoteLine | null> {
  const store = await load();
  return store.quoteLines.find((l) => l.id === lineId) ?? null;
}

export async function cloneQuoteToProject(input: {
  sourceQuoteId: string;
  targetProjectId: string;
  quoteCode: string;
  title?: string;
}): Promise<QuoteWithLines> {
  const store = await load();
  const source = store.quotes.find((q) => q.id === input.sourceQuoteId);
  if (!source) throw new Error("Quote not found");
  const sourceLines = store.quoteLines
    .filter((l) => l.quoteId === source.id)
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime(),
    );

  const now = new Date();
  const quoteCode = input.quoteCode.trim();
  const quote: Quote = {
    id: createId("quote"),
    projectId: input.targetProjectId,
    quoteCode,
    title: input.title?.trim() || `Cotización #${quoteCode}`,
    status: "DRAFT",
    commercialStatus: "NONE",
    mermaPercent: source.mermaPercent,
    utilidadPercent: source.utilidadPercent,
    extraPercent: source.extraPercent,
    discountPercent: source.discountPercent,
    includeIva: source.includeIva,
    warrantyMonths: source.warrantyMonths,
    installmentCount: source.installmentCount,
    installmentInterestFree: source.installmentInterestFree,
    observations: source.observations,
    showObservations: source.showObservations,
    costs: source.costs ?? quoteCostsFromLines(sourceLines),
    createdAt: now,
    updatedAt: now,
  };
  store.quotes.push(quote);

  const lines: QuoteLine[] = sourceLines.map((line) => ({
    id: createId("qline"),
    quoteId: quote.id,
    materialId: line.materialId,
    name: line.name,
    categoryId: line.categoryId,
    categoryName: line.categoryName,
    unit: line.unit,
    unitCost: line.unitCost,
    quantity: line.quantity,
    sortOrder: line.sortOrder,
    createdAt: now,
    updatedAt: now,
  }));
  store.quoteLines.push(...lines);
  await save(store);
  return { ...quote, lines };
}
