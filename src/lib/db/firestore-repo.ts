import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { createId, stripUndefined, toDate } from "@/lib/db/serialize";
import type {
  AuditAction,
  AuditLog,
  ChileAddress,
  Client,
  QuoteCosts,
  ClientWithProjects,
  CompanySettings,
  FileKind,
  FileRef,
  FollowUpSettings,
  Material,
  MaterialCategory,
  MaterialUnit,
  PipelineStage,
  Project,
  ProjectClosingOutcome,
  ProjectNote,
  ProjectStatus,
  ProjectWithRelations,
  Quote,
  QuoteCommercialStatus,
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
import { cachedRead, invalidateQueryCache } from "@/lib/db/query-cache";

type CachedDoc = { id: string; data: DocumentData };

/**
 * Lee una colección completa a través de la caché. Firestore cobra una lectura
 * por documento, así que estas consultas son las más caras de la app.
 */
async function readCollection(name: string): Promise<CachedDoc[]> {
  return cachedRead(`collection:${name}`, async () => {
    const snap = await getAdminDb().collection(name).get();
    return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
  });
}

function normalizeClientCode(code: string): string {
  if (code.startsWith("L-")) return `C-${code.slice(2)}`;
  return code;
}

function mapClient(id: string, data: DocumentData): Client {
  return {
    id,
    leadCode: normalizeClientCode(data.leadCode ?? `TMP-${id.slice(-6)}`),
    firstName: data.firstName ?? "",
    lastName: data.lastName ?? "",
    phone: data.phone ?? null,
    email: data.email ?? null,
    address: data.address ?? null,
    driveFolderId: data.driveFolderId ?? null,
    driveFolderUrl: data.driveFolderUrl ?? null,
    deletedAt: data.deletedAt ? toDate(data.deletedAt) : null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function mapProject(id: string, data: DocumentData): Project {
  const createdAt = toDate(data.createdAt);
  const followUpCount = Math.max(
    0,
    Math.floor(Number(data.followUpCount ?? 0)) || 0,
  );
  const nextNumber = Number(data.followUpNextNumber);
  return {
    id,
    publicCode: data.publicCode,
    clientId: data.clientId,
    status: data.status,
    stageId: data.stageId ?? null,
    boardOrder:
      typeof data.boardOrder === "number"
        ? data.boardOrder
        : -createdAt.getTime(),
    title: data.title ?? null,
    notes: data.notes ?? null,
    calendarEventId: data.calendarEventId ?? null,
    driveFolderId: data.driveFolderId ?? null,
    driveFolderUrl: data.driveFolderUrl ?? null,
    driveSyncPending: Boolean(data.driveSyncPending),
    followUpCount,
    followUpStartedAt: data.followUpStartedAt
      ? toDate(data.followUpStartedAt)
      : null,
    followUpLastAt: data.followUpLastAt ? toDate(data.followUpLastAt) : null,
    followUpNextNumber:
      Number.isFinite(nextNumber) && nextNumber > 0
        ? Math.floor(nextNumber)
        : null,
    followUpNextAt: data.followUpNextAt ? toDate(data.followUpNextAt) : null,
    followUpTaskId: data.followUpTaskId ?? null,
    followUpTaskListId: data.followUpTaskListId ?? null,
    closedAt: data.closedAt ? toDate(data.closedAt) : null,
    closingOutcome:
      data.closingOutcome === "APROBADO" || data.closingOutcome === "RECHAZADO"
        ? (data.closingOutcome as ProjectClosingOutcome)
        : null,
    closedQuoteId: data.closedQuoteId ?? null,
    closedAmount:
      data.closedAmount == null ? null : Number(data.closedAmount) || 0,
    deletedAt: data.deletedAt ? toDate(data.deletedAt) : null,
    deletedWithClient: Boolean(data.deletedWithClient),
    createdAt,
    updatedAt: toDate(data.updatedAt),
  };
}

function compareProjectsBoardOrder(a: Project, b: Project) {
  if (a.boardOrder !== b.boardOrder) return a.boardOrder - b.boardOrder;
  return b.createdAt.getTime() - a.createdAt.getTime();
}

function mapVisit(id: string, data: DocumentData): Visit {
  const createdAt = toDate(data.createdAt);
  return {
    id,
    projectId: data.projectId,
    scheduledAt: toDate(data.scheduledAt),
    bookedAt: data.bookedAt ? toDate(data.bookedAt) : createdAt,
    durationMin: data.durationMin ?? 60,
    timezone: data.timezone ?? "America/Santiago",
    source: data.source,
    notes: data.notes ?? null,
    createdAt,
    updatedAt: toDate(data.updatedAt),
  };
}

async function getFilesForProject(projectId: string): Promise<FileRef[]> {
  const db = getAdminDb();
  const snap = await db
    .collection("fileRefs")
    .where("projectId", "==", projectId)
    .get();
  return snap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        projectId: data.projectId,
        driveFileId: data.driveFileId,
        kind: data.kind,
        name: data.name,
        mimeType: data.mimeType ?? null,
        webViewLink: data.webViewLink ?? null,
        createdAt: toDate(data.createdAt),
      } satisfies FileRef;
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

function mapProjectNote(id: string, data: DocumentData): ProjectNote {
  return {
    id,
    projectId: data.projectId,
    body: data.body ?? "",
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt ?? data.createdAt),
  };
}

export async function listProjectNotes(
  projectId: string,
): Promise<ProjectNote[]> {
  const db = getAdminDb();
  const snap = await db
    .collection("projectNotes")
    .where("projectId", "==", projectId)
    .get();

  let notes = snap.docs
    .map((doc) => mapProjectNote(doc.id, doc.data()))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Migrar nota legada (campo project.notes) a la primera entrada
  if (notes.length === 0) {
    const projectSnap = await db.collection("projects").doc(projectId).get();
    const legacy = projectSnap.exists
      ? String(projectSnap.data()?.notes ?? "").trim()
      : "";
    if (legacy) {
      const migrated = await createProjectNote({ projectId, body: legacy });
      await db
        .collection("projects")
        .doc(projectId)
        .update({ notes: null, updatedAt: new Date() });
      invalidateQueryCache("collection:projects");
      notes = [migrated];
    }
  }

  return notes;
}

export async function createProjectNote(input: {
  projectId: string;
  body: string;
}): Promise<ProjectNote> {
  const db = getAdminDb();
  const id = createId("note");
  const now = new Date();
  const payload = {
    projectId: input.projectId,
    body: input.body.trim(),
    createdAt: now,
    updatedAt: now,
  };
  await db.collection("projectNotes").doc(id).set(payload);
  return mapProjectNote(id, payload);
}

export async function updateProjectNote(
  noteId: string,
  body: string,
): Promise<ProjectNote> {
  const db = getAdminDb();
  const ref = db.collection("projectNotes").doc(noteId);
  const existing = await ref.get();
  if (!existing.exists) throw new Error("Note not found");
  const now = new Date();
  // Al editar: nueva fecha de creación → vuelve al tope del listado
  await ref.update({
    body: body.trim(),
    createdAt: now,
    updatedAt: now,
  });
  const fresh = await ref.get();
  return mapProjectNote(fresh.id, fresh.data()!);
}

export async function deleteProjectNote(noteId: string): Promise<void> {
  await getAdminDb().collection("projectNotes").doc(noteId).delete();
}

export async function getProjectNoteById(
  noteId: string,
): Promise<ProjectNote | null> {
  const snap = await getAdminDb().collection("projectNotes").doc(noteId).get();
  if (!snap.exists) return null;
  return mapProjectNote(snap.id, snap.data()!);
}

/** Referencia registrada en el CRM para un archivo de Drive (o null). */
export async function getFileRefByDriveFileId(
  driveFileId: string,
): Promise<FileRef | null> {
  const snap = await getAdminDb()
    .collection("fileRefs")
    .where("driveFileId", "==", driveFileId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data();
  return {
    id: doc.id,
    projectId: data.projectId,
    driveFileId: data.driveFileId,
    kind: data.kind,
    name: data.name,
    mimeType: data.mimeType ?? null,
    webViewLink: data.webViewLink ?? null,
    createdAt: toDate(data.createdAt),
  };
}

export async function createAuditLog(input: {
  action: AuditAction;
  actorEmail: string;
  target?: string | null;
  detail?: string | null;
}): Promise<AuditLog> {
  const id = createId("audit");
  const payload = {
    action: input.action,
    actorEmail: input.actorEmail,
    target: input.target ?? null,
    detail: input.detail ?? null,
    createdAt: new Date(),
  };
  await getAdminDb().collection("auditLogs").doc(id).set(payload);
  return { id, ...payload };
}

export async function listAuditLogs(limit = 100): Promise<AuditLog[]> {
  const snap = await getAdminDb()
    .collection("auditLogs")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      action: data.action as AuditAction,
      actorEmail: data.actorEmail ?? "",
      target: data.target ?? null,
      detail: data.detail ?? null,
      createdAt: toDate(data.createdAt),
    };
  });
}

export async function createFileRef(input: {
  projectId: string;
  driveFileId: string;
  kind: FileKind;
  name: string;
  mimeType?: string | null;
  webViewLink?: string | null;
}): Promise<FileRef> {
  const db = getAdminDb();
  const id = createId("file");
  const now = new Date();
  const payload = {
    projectId: input.projectId,
    driveFileId: input.driveFileId,
    kind: input.kind,
    name: input.name,
    mimeType: input.mimeType ?? null,
    webViewLink: input.webViewLink ?? null,
    createdAt: now,
  };
  await db.collection("fileRefs").doc(id).set(payload);
  return { id, ...payload };
}

function preferPersonName(incoming: string, current: string): string {
  const next = (incoming || "").trim();
  const prev = (current || "").trim();
  if (!next) return prev;
  if (/^studio\s*360$/i.test(next)) return prev || next;
  if (/^studio\s*360$/i.test(prev)) return next;
  return next || prev;
}

export async function nextPublicCode(): Promise<string> {
  const db = getAdminDb();
  const ref = db.collection("meta").doc("projectCodeSequence");
  const value = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? Number(snap.data()?.value ?? 0) : 0;
    const next = current + 1;
    tx.set(ref, { value: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next;
  });
  return buildEntityCode("P", value);
}

export async function nextLeadCode(): Promise<string> {
  const db = getAdminDb();
  const ref = db.collection("meta").doc("leadCodeSequence");
  const value = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? Number(snap.data()?.value ?? 0) : 0;
    const next = current + 1;
    tx.set(ref, { value: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next;
  });
  return buildEntityCode("C", value);
}

export async function upsertClient(input: {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}): Promise<Client> {
  const db = getAdminDb();
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() || null;

  if (email) {
    const existing = await db
      .collection("clients")
      .where("email", "==", email)
      .limit(5)
      .get();
    const match = existing.docs.find((d) => !d.data().deletedAt);
    if (match) {
      const doc = match;
      const data = doc.data();
      const leadCode =
        data.leadCode && !String(data.leadCode).startsWith("TMP-")
          ? normalizeClientCode(String(data.leadCode))
          : await nextLeadCode();
      await doc.ref.update(
        stripUndefined({
          leadCode,
          firstName: preferPersonName(input.firstName, data.firstName),
          lastName: preferPersonName(input.lastName, data.lastName || ""),
          phone: phone || data.phone || null,
          address: input.address || data.address || null,
          updatedAt: new Date(),
        }),
      );
      const fresh = await doc.ref.get();
      return mapClient(fresh.id, fresh.data()!);
    }
  }

  if (phone) {
    const existing = await db
      .collection("clients")
      .where("phone", "==", phone)
      .limit(5)
      .get();
    const match = existing.docs.find((d) => !d.data().deletedAt);
    if (match) {
      const doc = match;
      const data = doc.data();
      const leadCode =
        data.leadCode && !String(data.leadCode).startsWith("TMP-")
          ? normalizeClientCode(String(data.leadCode))
          : await nextLeadCode();
      await doc.ref.update(
        stripUndefined({
          leadCode,
          firstName: preferPersonName(input.firstName, data.firstName),
          lastName: preferPersonName(input.lastName, data.lastName || ""),
          email: email || data.email || null,
          phone: phone || data.phone || null,
          address: input.address || data.address || null,
          updatedAt: new Date(),
        }),
      );
      const fresh = await doc.ref.get();
      return mapClient(fresh.id, fresh.data()!);
    }
  }

  const id = createId("cli");
  const now = new Date();
  const leadCode = await nextLeadCode();
  const payload = {
    leadCode,
    firstName: input.firstName,
    lastName: input.lastName,
    email,
    phone,
    address: input.address ?? null,
    driveFolderId: null,
    driveFolderUrl: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.collection("clients").doc(id).set(payload);
  return mapClient(id, payload);
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
  const ref = getAdminDb().collection("clients").doc(id);
  const existing = await ref.get();
  if (!existing.exists) {
    throw new Error("Client not found");
  }
  const current = existing.data()!;
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (data.firstName !== undefined) {
    patch.firstName = preferPersonName(data.firstName, current.firstName);
  }
  if (data.lastName !== undefined) {
    patch.lastName = preferPersonName(
      data.lastName || "",
      current.lastName || "",
    );
  }
  if (data.email !== undefined) {
    patch.email = data.email?.trim() || null;
  }
  if (data.phone !== undefined) {
    patch.phone = data.phone?.trim() || null;
  }
  if (data.address !== undefined) {
    patch.address = data.address?.trim() || null;
  }
  if (data.driveFolderId !== undefined) {
    patch.driveFolderId = data.driveFolderId;
  }
  if (data.driveFolderUrl !== undefined) {
    patch.driveFolderUrl = data.driveFolderUrl;
  }
  // Códigos permanentes no se reasignan aquí. Solo L- → C- (mismo número).
  const currentCode = String(current.leadCode ?? "");
  if (currentCode.startsWith("L-")) {
    patch.leadCode = normalizeClientCode(currentCode);
  }

  await ref.update(patch);
  const fresh = await ref.get();
  return mapClient(fresh.id, fresh.data()!);
}

/** Asigna C-xx solo si el cliente aún tiene código temporal. No cambia códigos permanentes. */
export async function promoteTemporaryLeadCode(id: string): Promise<Client> {
  const ref = getAdminDb().collection("clients").doc(id);
  const existing = await ref.get();
  if (!existing.exists) throw new Error("Client not found");
  const current = existing.data()!;
  const code = String(current.leadCode ?? "");
  if (code && !code.startsWith("TMP-")) {
    if (code.startsWith("L-")) {
      await ref.update({
        leadCode: normalizeClientCode(code),
        updatedAt: new Date(),
      });
      const fresh = await ref.get();
      return mapClient(fresh.id, fresh.data()!);
    }
    return mapClient(existing.id, current);
  }
  const leadCode = await nextLeadCode();
  await ref.update({ leadCode, updatedAt: new Date() });
  const fresh = await ref.get();
  return mapClient(fresh.id, fresh.data()!);
}

export async function setClientLeadCode(
  id: string,
  leadCode: string,
): Promise<Client> {
  const ref = getAdminDb().collection("clients").doc(id);
  await ref.update({ leadCode, updatedAt: new Date() });
  const fresh = await ref.get();
  return mapClient(fresh.id, fresh.data()!);
}

export async function setProjectPublicCode(
  id: string,
  publicCode: string,
): Promise<Project> {
  const ref = getAdminDb().collection("projects").doc(id);
  await ref.update({ publicCode, updatedAt: new Date() });
  const snap = await ref.get();
  return mapProject(snap.id, snap.data()!);
}

export async function setCodeSequences(options: {
  projectValue: number;
  leadValue: number;
}): Promise<void> {
  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();
  await Promise.all([
    db.collection("meta").doc("projectCodeSequence").set(
      { value: options.projectValue, updatedAt: now },
      { merge: true },
    ),
    db.collection("meta").doc("leadCodeSequence").set(
      { value: options.leadValue, updatedAt: now },
      { merge: true },
    ),
  ]);
}

export async function updateVisitNotes(
  visitId: string,
  notes: string | null,
): Promise<void> {
  await getAdminDb().collection("visits").doc(visitId).update({
    notes,
    updatedAt: new Date(),
  });
}

export async function updateVisit(
  visitId: string,
  data: Partial<Pick<Visit, "bookedAt" | "scheduledAt" | "notes">>,
): Promise<void> {
  await getAdminDb()
    .collection("visits")
    .doc(visitId)
    .update(stripUndefined({ ...data, updatedAt: new Date() }));
}

export async function getClientById(id: string): Promise<Client | null> {
  const snap = await getAdminDb().collection("clients").doc(id).get();
  if (!snap.exists) return null;
  return mapClient(snap.id, snap.data()!);
}

export async function listClients(): Promise<ClientWithProjects[]> {
  const [clientDocs, projectDocs] = await Promise.all([
    readCollection("clients"),
    readCollection("projects"),
  ]);
  const projects = projectDocs
    .map((d) => mapProject(d.id, d.data))
    .filter((p) => !p.deletedAt);

  return clientDocs
    .map((doc) => mapClient(doc.id, doc.data))
    .filter((client) => !client.deletedAt)
    .map((client) => {
      const clientProjects = projects
        .filter((p) => p.clientId === client.id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return {
        ...client,
        projects: clientProjects.slice(0, 5),
        projectCount: clientProjects.length,
      };
    })
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function getClientWithProjects(
  id: string,
): Promise<ClientWithProjects | null> {
  const client = await getClientById(id);
  if (!client) return null;
  const snap = await getAdminDb()
    .collection("projects")
    .where("clientId", "==", id)
    .get();
  const projects = snap.docs
    .map((d) => mapProject(d.id, d.data()))
    .filter((p) => !p.deletedAt)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return { ...client, projects, projectCount: projects.length };
}

export async function deleteClient(id: string): Promise<void> {
  const db = getAdminDb();
  const projects = await db
    .collection("projects")
    .where("clientId", "==", id)
    .get();
  const stillHas = projects.docs.some((d) => !d.data().deletedAt);
  if (stillHas) {
    throw new Error("Client still has projects");
  }
  await db.collection("clients").doc(id).delete();
}

export async function setProjectTrashed(
  id: string,
  input: { deletedAt: Date | null; deletedWithClient?: boolean },
): Promise<Project> {
  const ref = getAdminDb().collection("projects").doc(id);
  await ref.update({
    deletedAt: input.deletedAt,
    deletedWithClient: input.deletedAt
      ? Boolean(input.deletedWithClient)
      : false,
    updatedAt: new Date(),
  });
  const snap = await ref.get();
  return mapProject(snap.id, snap.data()!);
}

export async function setClientTrashed(
  id: string,
  deletedAt: Date | null,
): Promise<Client> {
  const ref = getAdminDb().collection("clients").doc(id);
  await ref.update({ deletedAt, updatedAt: new Date() });
  const snap = await ref.get();
  return mapClient(snap.id, snap.data()!);
}

export async function listProjectsByClientId(
  clientId: string,
  options?: { includeDeleted?: boolean },
): Promise<Project[]> {
  const snap = await getAdminDb()
    .collection("projects")
    .where("clientId", "==", clientId)
    .get();
  return snap.docs
    .map((d) => mapProject(d.id, d.data()))
    .filter((p) => (options?.includeDeleted ? true : !p.deletedAt))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function listTrashedProjects(): Promise<TrashedProject[]> {
  const [projectDocs, clientDocs] = await Promise.all([
    readCollection("projects"),
    readCollection("clients"),
  ]);
  const clientsById = new Map(
    clientDocs.map((d) => [d.id, mapClient(d.id, d.data)]),
  );
  return projectDocs
    .map((d) => mapProject(d.id, d.data))
    .filter((p) => Boolean(p.deletedAt))
    .sort(
      (a, b) => (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0),
    )
    .map((project) => ({
      ...project,
      client: clientsById.get(project.clientId) ?? null,
    }));
}

export async function listTrashedClients(): Promise<TrashedClient[]> {
  const [clientDocs, projectDocs] = await Promise.all([
    readCollection("clients"),
    readCollection("projects"),
  ]);
  const projects = projectDocs.map((d) => mapProject(d.id, d.data));
  return clientDocs
    .map((d) => mapClient(d.id, d.data))
    .filter((c) => Boolean(c.deletedAt))
    .sort(
      (a, b) => (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0),
    )
    .map((client) => ({
      ...client,
      projects: projects
        .filter((p) => p.clientId === client.id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    }));
}

export async function hardDeleteProject(id: string): Promise<void> {
  const db = getAdminDb();
  const quotesSnap = await db
    .collection("quotes")
    .where("projectId", "==", id)
    .get();
  const quoteIds = quotesSnap.docs.map((d) => d.id);

  const batch = db.batch();
  for (const doc of quotesSnap.docs) batch.delete(doc.ref);

  for (const quoteId of quoteIds) {
    const linesSnap = await db
      .collection("quoteLines")
      .where("quoteId", "==", quoteId)
      .get();
    for (const doc of linesSnap.docs) batch.delete(doc.ref);
  }

  for (const collection of ["projectNotes", "visits", "fileRefs"]) {
    const snap = await db
      .collection(collection)
      .where("projectId", "==", id)
      .get();
    for (const doc of snap.docs) batch.delete(doc.ref);
  }

  batch.delete(db.collection("projects").doc(id));
  await batch.commit();
}

export async function hardDeleteClient(id: string): Promise<void> {
  await getAdminDb().collection("clients").doc(id).delete();
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
  const db = getAdminDb();
  const id = createId("prj");
  const now = new Date();
  const stageId = input.stageId ?? (await getFirstPipelineStageId());
  const payload = {
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
  await db.collection("projects").doc(id).set(payload);
  return mapProject(id, payload);
}

export async function reorderProjectsInStage(
  stageId: string,
  orderedIds: string[],
  status?: Project["status"],
): Promise<void> {
  const db = getAdminDb();
  const refs = orderedIds.map((id) => db.collection("projects").doc(id));
  const snaps = await db.getAll(...refs);
  const batch = db.batch();
  const now = new Date();
  snaps.forEach((snap, index) => {
    if (!snap.exists) return;
    const currentStageId = (snap.data()?.stageId as string | null) ?? null;
    const update: Record<string, unknown> = {
      stageId,
      boardOrder: index,
      updatedAt: now,
    };
    if (status && currentStageId !== stageId) {
      update.status = status;
    }
    batch.update(snap.ref, update);
  });
  await batch.commit();
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
  const ref = getAdminDb().collection("projects").doc(id);
  await ref.update(stripUndefined({ ...data, updatedAt: new Date() }));
  const snap = await ref.get();
  return mapProject(snap.id, snap.data()!);
}

export async function getProjectById(
  id: string,
): Promise<ProjectWithRelations | null> {
  // Proyecto, cliente y visitas salen de las colecciones cacheadas; solo
  // archivos y notas necesitan consulta propia.
  const [projectDocs, clientDocs, visitDocs] = await Promise.all([
    readCollection("projects"),
    readCollection("clients"),
    readCollection("visits"),
  ]);

  const projectDoc = projectDocs.find((doc) => doc.id === id);
  if (!projectDoc) return null;
  const project = mapProject(projectDoc.id, projectDoc.data);

  const clientDoc = clientDocs.find((doc) => doc.id === project.clientId);
  if (!clientDoc) return null;
  const client = mapClient(clientDoc.id, clientDoc.data);

  const visits = visitDocs
    .filter((doc) => doc.data.projectId === id)
    .map((doc) => mapVisit(doc.id, doc.data))
    .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());

  const [files, projectNotes] = await Promise.all([
    getFilesForProject(project.id),
    listProjectNotes(project.id),
  ]);
  return { ...project, client, visits, files, projectNotes };
}

export async function getProjectByCalendarEventId(
  calendarEventId: string,
): Promise<ProjectWithRelations | null> {
  const snap = await getAdminDb()
    .collection("projects")
    .where("calendarEventId", "==", calendarEventId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return getProjectById(snap.docs[0].id);
}

export async function listProjects(options?: {
  status?: ProjectStatus;
}): Promise<ProjectWithRelations[]> {
  // 3 lecturas en lote (cacheadas) en vez de 1 + 2N por proyecto.
  const [projectDocs, clientDocs, visitDocs] = await Promise.all([
    readCollection("projects"),
    readCollection("clients"),
    readCollection("visits"),
  ]);

  const clientsById = new Map(
    clientDocs.map((d) => [d.id, mapClient(d.id, d.data)]),
  );

  const visitsByProject = new Map<string, Visit[]>();
  for (const doc of visitDocs) {
    const visit = mapVisit(doc.id, doc.data);
    const list = visitsByProject.get(visit.projectId) ?? [];
    list.push(visit);
    visitsByProject.set(visit.projectId, list);
  }
  for (const list of visitsByProject.values()) {
    list.sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());
  }

  return projectDocs
    .map((d) => mapProject(d.id, d.data))
    .filter((project) => !options?.status || project.status === options.status)
    .filter((project) => !project.deletedAt)
    .sort(compareProjectsBoardOrder)
    .flatMap((project) => {
      const client = clientsById.get(project.clientId);
      if (!client) return [];
      return [
        {
          ...project,
          client,
          visits: visitsByProject.get(project.id) ?? [],
        },
      ];
    });
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
  const db = getAdminDb();
  const id = createId("vis");
  const now = new Date();
  const payload = {
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
  await db.collection("visits").doc(id).set(payload);
  return mapVisit(id, payload);
}

export async function countVisitsBetween(
  start: Date,
  end: Date,
): Promise<number> {
  // Reutiliza la colección cacheada: el dashboard ya la leyó para el tablero.
  const docs = await readCollection("visits");
  return docs.filter((doc) => {
    const at = toDate(doc.data.scheduledAt).getTime();
    return at >= start.getTime() && at <= end.getTime();
  }).length;
}

export async function countProjectsByStatus(
  status: ProjectStatus,
): Promise<number> {
  const docs = await readCollection("projects");
  return docs.filter(
    (doc) => doc.data.status === status && !doc.data.deletedAt,
  ).length;
}

export async function listPendingDriveProjects(): Promise<Project[]> {
  const snap = await getAdminDb()
    .collection("projects")
    .where("driveSyncPending", "==", true)
    .limit(50)
    .get();
  return snap.docs
    .map((d) => mapProject(d.id, d.data()))
    .filter((p) => !p.deletedAt);
}

function mapChileAddress(value: unknown): ChileAddress | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const address = sanitizeChileAddress({
    street: typeof data.street === "string" ? data.street : "",
    number: typeof data.number === "string" ? data.number : "",
    complement: typeof data.complement === "string" ? data.complement : "",
    commune: typeof data.commune === "string" ? data.commune : "",
    region: typeof data.region === "string" ? data.region : "",
  });
  if (!address.street && !address.number && !address.commune && !address.region) {
    return null;
  }
  return address;
}

function mapCompanySettings(data: DocumentData | undefined): CompanySettings {
  const phone =
    typeof data?.phone === "string" && data.phone.trim()
      ? data.phone.trim()
      : null;
  return {
    commercialAddress: mapChileAddress(data?.commercialAddress),
    phone,
    updatedAt: data?.updatedAt ? toDate(data.updatedAt) : new Date(0),
  };
}

export async function getCompanySettings(): Promise<CompanySettings> {
  const snap = await getAdminDb().collection("meta").doc("company").get();
  if (!snap.exists) {
    return {
      commercialAddress: null,
      phone: null,
      updatedAt: new Date(0),
    };
  }
  return mapCompanySettings(snap.data());
}

export async function updateCompanySettings(input: {
  commercialAddress?: ChileAddress | null;
  phone?: string | null;
}): Promise<CompanySettings> {
  const now = new Date();
  const existing = await getCompanySettings();
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
  const payload = {
    commercialAddress:
      commercialAddress &&
      (commercialAddress.street ||
        commercialAddress.number ||
        commercialAddress.commune ||
        commercialAddress.region)
        ? commercialAddress
        : null,
    phone,
    updatedAt: now,
  };
  await getAdminDb()
    .collection("meta")
    .doc("company")
    .set(payload, { merge: true });
  return {
    commercialAddress: payload.commercialAddress,
    phone: payload.phone,
    updatedAt: now,
  };
}

export async function getFollowUpSettings(): Promise<FollowUpSettings> {
  const snap = await getAdminDb().collection("meta").doc("followUps").get();
  if (!snap.exists) return DEFAULT_FOLLOW_UP_SETTINGS;
  const data = snap.data();
  return sanitizeFollowUpSettings({
    count: data?.count,
    intervalDays: data?.intervalDays,
    updatedAt: data?.updatedAt ? toDate(data.updatedAt) : null,
  });
}

export async function updateFollowUpSettings(input: {
  count: number;
  intervalDays: number[];
}): Promise<FollowUpSettings> {
  const next = sanitizeFollowUpSettings({
    count: input.count,
    intervalDays: input.intervalDays,
    updatedAt: new Date(),
  });
  await getAdminDb()
    .collection("meta")
    .doc("followUps")
    .set(
      {
        count: next.count,
        intervalDays: next.intervalDays,
        updatedAt: next.updatedAt,
      },
      { merge: true },
    );
  return next;
}

export async function getCalendarSyncToken(): Promise<string | null> {
  const snap = await getAdminDb().collection("meta").doc("calendarSync").get();
  return snap.exists ? (snap.data()?.syncToken ?? null) : null;
}

export async function setCalendarSyncToken(syncToken: string): Promise<void> {
  await getAdminDb()
    .collection("meta")
    .doc("calendarSync")
    .set({ syncToken, updatedAt: new Date() }, { merge: true });
}

export async function upsertStaffUser(input: {
  firebaseUid: string;
  email: string;
  displayName?: string | null;
}): Promise<StaffUser> {
  const db = getAdminDb();
  const ref = db.collection("staffUsers").doc(input.firebaseUid);
  const existing = await ref.get();
  const now = new Date();

  if (existing.exists) {
    const data = existing.data()!;
    const nextDisplayName =
      input.displayName ?? data.displayName ?? null;
    const emailChanged = data.email !== input.email;
    const nameChanged = (data.displayName ?? null) !== nextDisplayName;

    // Evita escribir en cada request (quema cuota de Firestore).
    if (!emailChanged && !nameChanged) {
      return {
        id: existing.id,
        firebaseUid: data.firebaseUid,
        email: data.email,
        displayName: data.displayName ?? null,
        role: data.role ?? "COMERCIAL",
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
      };
    }

    await ref.update({
      email: input.email,
      displayName: nextDisplayName,
      updatedAt: now,
    });
    return {
      id: existing.id,
      firebaseUid: data.firebaseUid,
      email: input.email,
      displayName: nextDisplayName,
      role: data.role ?? "COMERCIAL",
      createdAt: toDate(data.createdAt),
      updatedAt: now,
    };
  }

  const payload = {
    firebaseUid: input.firebaseUid,
    email: input.email,
    displayName: input.displayName ?? null,
    role: "COMERCIAL" as const,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(payload);
  return {
    id: input.firebaseUid,
    ...payload,
  };
}

function mapStage(id: string, data: DocumentData): PipelineStage {
  return {
    id,
    name: data.name,
    order: Number(data.order ?? 0),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export async function listPipelineStages(): Promise<PipelineStage[]> {
  const db = getAdminDb();
  const docs = await readCollection("pipelineStages");
  if (docs.length === 0) {
    return ensureDefaultPipelineStages();
  }
  let stages = sortStages(docs.map((d) => mapStage(d.id, d.data)));
  if (!stages.some((s) => isClosedStageName(s.name))) {
    const now = new Date();
    const id = createId("stg");
    const payload = {
      name: CLOSED_STAGE_NAME,
      order: stages.length,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection("pipelineStages").doc(id).set(payload);
    invalidateQueryCache("collection:pipelineStages");
    stages = sortStages([...stages, { id, ...payload }]);
  }
  await assignMissingProjectStages(stages[0]?.id ?? null);
  return stages;
}

export async function ensureDefaultPipelineStages(): Promise<PipelineStage[]> {
  const db = getAdminDb();
  const existing = await readCollection("pipelineStages");
  if (existing.length > 0) {
    return sortStages(existing.map((d) => mapStage(d.id, d.data)));
  }

  const now = new Date();
  const batch = db.batch();
  const stages: PipelineStage[] = [];

  DEFAULT_PIPELINE_STAGES.forEach((name, index) => {
    const id = createId("stg");
    const ref = db.collection("pipelineStages").doc(id);
    const payload = {
      name,
      order: index,
      createdAt: now,
      updatedAt: now,
    };
    batch.set(ref, payload);
    stages.push({ id, ...payload });
  });

  await batch.commit();
  invalidateQueryCache("collection:pipelineStages");
  await assignMissingProjectStages(stages[0]?.id ?? null);
  return stages;
}

export async function getFirstPipelineStageId(): Promise<string | null> {
  const stages = await listPipelineStages();
  return stages[0]?.id ?? null;
}

async function assignMissingProjectStages(fallbackStageId: string | null) {
  if (!fallbackStageId) return;
  const db = getAdminDb();
  const docs = await readCollection("projects");
  const pending = docs.filter((doc) => !doc.data.stageId);
  if (pending.length === 0) return;

  const batch = db.batch();
  for (const doc of pending) {
    batch.update(db.collection("projects").doc(doc.id), {
      stageId: fallbackStageId,
      updatedAt: new Date(),
    });
  }
  await batch.commit();
  invalidateQueryCache("collection:projects");
}

export async function createPipelineStage(input: {
  name: string;
}): Promise<PipelineStage> {
  const stages = await listPipelineStages();
  const db = getAdminDb();
  const id = createId("stg");
  const now = new Date();
  const payload = {
    name: input.name.trim(),
    order: stages.length,
    createdAt: now,
    updatedAt: now,
  };
  await db.collection("pipelineStages").doc(id).set(payload);
  return { id, ...payload };
}

export async function updatePipelineStage(
  id: string,
  data: Partial<Pick<PipelineStage, "name" | "order">>,
): Promise<PipelineStage> {
  const ref = getAdminDb().collection("pipelineStages").doc(id);
  if (data.name !== undefined) {
    const current = await ref.get();
    const currentName = String(current.data()?.name ?? "");
    if (isClosedStageName(currentName)) {
      throw new Error("La etapa Cerrado es fija y no se puede renombrar");
    }
  }
  await ref.update(
    stripUndefined({
      name: data.name?.trim(),
      order: data.order,
      updatedAt: new Date(),
    }),
  );
  const snap = await ref.get();
  return mapStage(snap.id, snap.data()!);
}

export async function deletePipelineStage(id: string): Promise<void> {
  const stages = await listPipelineStages();
  if (stages.length <= 1) {
    throw new Error("Debe existir al menos una etapa en el pipeline");
  }
  const target = stages.find((s) => s.id === id);
  if (target && isClosedStageName(target.name)) {
    throw new Error("La etapa Cerrado es fija y no se puede eliminar");
  }
  const fallback = stages.find((s) => s.id !== id);
  if (!fallback) {
    throw new Error("No hay etapa de destino");
  }

  const db = getAdminDb();
  const projects = await db
    .collection("projects")
    .where("stageId", "==", id)
    .get();
  const batch = db.batch();
  for (const doc of projects.docs) {
    batch.update(doc.ref, { stageId: fallback.id, updatedAt: new Date() });
  }
  batch.delete(db.collection("pipelineStages").doc(id));
  await batch.commit();

  const remaining = stages
    .filter((s) => s.id !== id)
    .sort((a, b) => a.order - b.order);
  await reorderPipelineStages(remaining.map((s) => s.id));
}

export async function reorderPipelineStages(
  orderedIds: string[],
): Promise<PipelineStage[]> {
  const db = getAdminDb();
  const current = await listPipelineStages();
  const closedIds = current
    .filter((s) => isClosedStageName(s.name))
    .map((s) => s.id);
  const finalOrder = [
    ...orderedIds.filter((id) => !closedIds.includes(id)),
    ...closedIds,
  ];
  const batch = db.batch();
  finalOrder.forEach((id, index) => {
    batch.update(db.collection("pipelineStages").doc(id), {
      order: index,
      updatedAt: new Date(),
    });
  });
  await batch.commit();
  return listPipelineStages();
}

function mapMaterial(id: string, data: DocumentData): Material {
  return {
    id,
    name: data.name ?? "",
    categoryId: data.categoryId ?? null,
    unit: data.unit as MaterialUnit,
    costPrice: Number(data.costPrice ?? 0),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function mapMaterialCategory(id: string, data: DocumentData): MaterialCategory {
  return {
    id,
    name: data.name ?? "",
    order: Number(data.order ?? 0),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export async function listMaterialCategories(): Promise<MaterialCategory[]> {
  const docs = await readCollection("materialCategories");
  if (docs.length === 0) return ensureDefaultMaterialCategories();
  return sortMaterialCategories(
    docs.map((d) => mapMaterialCategory(d.id, d.data)),
  );
}

export async function ensureDefaultMaterialCategories(): Promise<
  MaterialCategory[]
> {
  const db = getAdminDb();
  const existing = await readCollection("materialCategories");
  if (existing.length > 0) {
    return sortMaterialCategories(
      existing.map((d) => mapMaterialCategory(d.id, d.data)),
    );
  }

  const now = new Date();
  const batch = db.batch();
  const categories: MaterialCategory[] = [];

  DEFAULT_MATERIAL_CATEGORIES.forEach((name, index) => {
    const id = createId("mcg");
    const ref = db.collection("materialCategories").doc(id);
    const payload = {
      name,
      order: index,
      createdAt: now,
      updatedAt: now,
    };
    batch.set(ref, payload);
    categories.push({ id, ...payload });
  });

  await batch.commit();
  invalidateQueryCache("collection:materialCategories");
  return categories;
}

export async function createMaterialCategory(input: {
  name: string;
}): Promise<MaterialCategory> {
  const categories = await listMaterialCategories();
  const id = createId("mcg");
  const now = new Date();
  const payload = {
    name: input.name.trim(),
    order: categories.length,
    createdAt: now,
    updatedAt: now,
  };
  await getAdminDb().collection("materialCategories").doc(id).set(payload);
  return { id, ...payload };
}

export async function updateMaterialCategory(
  id: string,
  data: Partial<Pick<MaterialCategory, "name" | "order">>,
): Promise<MaterialCategory> {
  const ref = getAdminDb().collection("materialCategories").doc(id);
  await ref.update(
    stripUndefined({
      name: data.name?.trim(),
      order: data.order,
      updatedAt: new Date(),
    }),
  );
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Category not found");
  return mapMaterialCategory(snap.id, snap.data()!);
}

export async function deleteMaterialCategory(id: string): Promise<void> {
  const categories = await listMaterialCategories();
  if (categories.length <= 1) {
    throw new Error("Debe existir al menos una categoría");
  }
  const fallback = categories.find((c) => c.id !== id);
  if (!fallback) throw new Error("No hay categoría de destino");

  const db = getAdminDb();
  const materials = await db
    .collection("materials")
    .where("categoryId", "==", id)
    .get();
  const batch = db.batch();
  for (const doc of materials.docs) {
    batch.update(doc.ref, { categoryId: fallback.id, updatedAt: new Date() });
  }
  batch.delete(db.collection("materialCategories").doc(id));
  await batch.commit();

  const remaining = categories
    .filter((c) => c.id !== id)
    .sort((a, b) => a.order - b.order);
  const reorder = db.batch();
  remaining.forEach((category, index) => {
    reorder.update(db.collection("materialCategories").doc(category.id), {
      order: index,
      updatedAt: new Date(),
    });
  });
  await reorder.commit();
}

export async function listMaterials(): Promise<Material[]> {
  await listMaterialCategories();
  const docs = await readCollection("materials");
  return docs
    .map((d) => mapMaterial(d.id, d.data))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export async function createMaterial(input: {
  name: string;
  categoryId?: string | null;
  unit: MaterialUnit;
  costPrice: number;
}): Promise<Material> {
  const categories = await listMaterialCategories();
  const id = createId("mat");
  const now = new Date();
  const payload = {
    name: input.name.trim(),
    categoryId: input.categoryId ?? categories[0]?.id ?? null,
    unit: input.unit,
    costPrice: input.costPrice,
    createdAt: now,
    updatedAt: now,
  };
  await getAdminDb().collection("materials").doc(id).set(payload);
  return mapMaterial(id, payload);
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
  const fallbackCategoryId = categories[0]?.id ?? null;
  const db = getAdminDb();
  const batch = db.batch();
  const now = new Date();
  const materials: Material[] = [];

  for (const input of inputs) {
    const id = createId("mat");
    const payload = {
      name: input.name.trim(),
      categoryId: input.categoryId ?? fallbackCategoryId,
      unit: input.unit,
      costPrice: input.costPrice,
      createdAt: now,
      updatedAt: now,
    };
    batch.set(db.collection("materials").doc(id), payload);
    materials.push(mapMaterial(id, payload));
  }

  await batch.commit();
  return materials;
}

export async function updateMaterial(
  id: string,
  data: Partial<Pick<Material, "name" | "categoryId" | "unit" | "costPrice">>,
): Promise<Material> {
  const ref = getAdminDb().collection("materials").doc(id);
  await ref.update(
    stripUndefined({
      name: data.name?.trim(),
      categoryId: data.categoryId,
      unit: data.unit,
      costPrice: data.costPrice,
      updatedAt: new Date(),
    }),
  );
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Material not found");
  return mapMaterial(snap.id, snap.data()!);
}

export async function deleteMaterial(id: string): Promise<void> {
  await getAdminDb().collection("materials").doc(id).delete();
}

export async function deleteAllMaterials(): Promise<number> {
  const db = getAdminDb();
  const snap = await db.collection("materials").get();
  let deleted = 0;
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    const chunk = snap.docs.slice(i, i + 400);
    for (const doc of chunk) batch.delete(doc.ref);
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

function mapCommercialStatus(value: unknown): QuoteCommercialStatus {
  if (value === "SENT" || value === "ACCEPTED" || value === "REJECTED") {
    return value;
  }
  return "NONE";
}

function mapQuote(id: string, data: DocumentData): Quote {
  return {
    id,
    projectId: data.projectId,
    quoteCode:
      typeof data.quoteCode === "string" && data.quoteCode.trim()
        ? data.quoteCode.trim()
        : null,
    title: data.title ?? "Presupuesto",
    status: (data.status as QuoteStatus) ?? "DRAFT",
    commercialStatus: mapCommercialStatus(data.commercialStatus),
    mermaPercent: Number(data.mermaPercent ?? 0),
    utilidadPercent: Number(data.utilidadPercent ?? 0),
    extraPercent: Number(data.extraPercent ?? 0),
    discountPercent: Number(data.discountPercent ?? 0),
    includeIva: Boolean(data.includeIva),
    warrantyMonths: Number(data.warrantyMonths ?? 0),
    installmentCount: Number(data.installmentCount ?? 0),
    installmentInterestFree: Boolean(data.installmentInterestFree),
    observations:
      typeof data.observations === "string" ? data.observations : "",
    showObservations: data.showObservations !== false,
    costs: mapQuoteCosts(data.costs),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function mapQuoteCosts(value: unknown): QuoteCosts | null {
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

function mapQuoteLine(id: string, data: DocumentData): QuoteLine {
  return {
    id,
    quoteId: data.quoteId,
    materialId: data.materialId,
    name: data.name ?? "",
    categoryId: data.categoryId ?? null,
    categoryName: data.categoryName ?? "Sin categoría",
    unit: data.unit,
    unitCost: Number(data.unitCost ?? 0),
    quantity: Number(data.quantity ?? 0),
    sortOrder: Number(data.sortOrder ?? 0),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export async function listQuotesByProject(
  projectId: string,
): Promise<Quote[]> {
  const docs = await readCollection("quotes");
  return docs
    .map((d) => mapQuote(d.id, d.data))
    .filter((quote) => quote.projectId === projectId)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function listRecentQuotes(
  limit = 50,
): Promise<QuoteWithProject[]> {
  // Todo se resuelve sobre las colecciones cacheadas: sin consultas por
  // cotización (antes eran ~5 lecturas extra por cada una).
  const [quoteDocs, projectDocs, clientDocs] = await Promise.all([
    readCollection("quotes"),
    readCollection("projects"),
    readCollection("clients"),
  ]);

  const quotes = quoteDocs
    .map((d) => mapQuote(d.id, d.data))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, limit);

  const projectsById = new Map<string, Project>();
  for (const doc of projectDocs) {
    const project = mapProject(doc.id, doc.data);
    if (project.deletedAt) continue;
    projectsById.set(project.id, project);
  }
  const clientsById = new Map<string, Client>(
    clientDocs.map((doc) => [doc.id, mapClient(doc.id, doc.data)]),
  );

  const result: QuoteWithProject[] = [];
  for (const quote of quotes) {
    const project = projectsById.get(quote.projectId);
    if (!project) continue;
    const client = clientsById.get(project.clientId);
    if (!client) continue;
    result.push({ ...quote, project, client });
  }
  return result;
}

/** Líneas de un conjunto acotado de cotizaciones (evita leer la colección). */
export async function listQuoteLinesByQuoteIds(
  quoteIds: string[],
): Promise<QuoteLine[]> {
  if (quoteIds.length === 0) return [];
  const db = getAdminDb();
  const unique = [...new Set(quoteIds)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 30) {
    chunks.push(unique.slice(i, i + 30));
  }

  const snaps = await Promise.all(
    chunks.map((chunk) =>
      db.collection("quoteLines").where("quoteId", "in", chunk).get(),
    ),
  );
  return snaps.flatMap((snap) =>
    snap.docs.map((d) => mapQuoteLine(d.id, d.data())),
  );
}

/** Todas las cotizaciones (sin líneas ni relaciones). */
export async function listAllQuotes(): Promise<Quote[]> {
  const docs = await readCollection("quotes");
  return docs
    .map((d) => mapQuote(d.id, d.data))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/**
 * Todas las líneas de cotización. Es la colección más grande de la base, así
 * que conviene usar listQuoteLinesByQuoteIds siempre que se pueda.
 */
export async function listAllQuoteLines(): Promise<QuoteLine[]> {
  const docs = await readCollection("quoteLines");
  return docs.map((d) => mapQuoteLine(d.id, d.data));
}

export async function getQuoteById(
  quoteId: string,
): Promise<QuoteWithLines | null> {
  const snap = await getAdminDb().collection("quotes").doc(quoteId).get();
  if (!snap.exists) return null;
  const quote = mapQuote(snap.id, snap.data()!);
  const linesSnap = await getAdminDb()
    .collection("quoteLines")
    .where("quoteId", "==", quoteId)
    .get();
  const lines = linesSnap.docs
    .map((d) => mapQuoteLine(d.id, d.data()))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
  return { ...quote, lines };
}

/** Busca cotización por código (ej. P1201). Comparación case-insensitive. */
export async function getQuoteByCode(
  code: string,
): Promise<QuoteWithProject | null> {
  const normalized = code.trim().replace(/^#/, "").toUpperCase();
  if (!normalized) return null;

  const docs = await readCollection("quotes");
  const match = docs.find((d) => {
    const raw = d.data.quoteCode;
    return (
      typeof raw === "string" &&
      raw.trim().replace(/^#/, "").toUpperCase() === normalized
    );
  });
  if (!match) return null;

  const quote = mapQuote(match.id, match.data);
  const project = await getProjectById(quote.projectId);
  if (!project) return null;
  return { ...quote, project, client: project.client };
}

export async function createQuote(input: {
  projectId: string;
  title?: string;
  quoteCode?: string;
}): Promise<Quote> {
  const db = getAdminDb();
  const id = createId("quote");
  const now = new Date();
  const quoteCode = input.quoteCode?.trim() || null;
  const payload = {
    projectId: input.projectId,
    quoteCode,
    title:
      input.title?.trim() ||
      (quoteCode ? `Cotización #${quoteCode}` : "Presupuesto de costos"),
    status: "DRAFT" as QuoteStatus,
    commercialStatus: "NONE" as QuoteCommercialStatus,
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
    costs: EMPTY_QUOTE_COSTS,
    createdAt: now,
    updatedAt: now,
  };
  await db.collection("quotes").doc(id).set(payload);
  return mapQuote(id, payload);
}

const EMPTY_QUOTE_COSTS: QuoteCosts = {
  labor: 0,
  logistics: 0,
  materials: 0,
};

/** Recalcula y guarda los costos de la cotización desde sus líneas. */
export async function setQuoteCosts(
  quoteId: string,
  costs: QuoteCosts,
): Promise<void> {
  await getAdminDb().collection("quotes").doc(quoteId).update({ costs });
  invalidateQueryCache("collection:quotes");
}

async function recalcQuoteCosts(quoteId: string): Promise<QuoteCosts> {
  const snap = await getAdminDb()
    .collection("quoteLines")
    .where("quoteId", "==", quoteId)
    .get();
  return quoteCostsFromLines(
    snap.docs.map((d) => mapQuoteLine(d.id, d.data())),
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
  const ref = getAdminDb().collection("quotes").doc(quoteId);
  await ref.update(
    stripUndefined({
      title: data.title?.trim(),
      status: data.status,
      commercialStatus: data.commercialStatus,
      mermaPercent: data.mermaPercent,
      utilidadPercent: data.utilidadPercent,
      extraPercent: data.extraPercent,
      discountPercent: data.discountPercent,
      includeIva: data.includeIva,
      warrantyMonths: data.warrantyMonths,
      installmentCount: data.installmentCount,
      installmentInterestFree: data.installmentInterestFree,
      observations: data.observations,
      showObservations: data.showObservations,
      updatedAt: new Date(),
    }),
  );
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Quote not found");
  return mapQuote(snap.id, snap.data()!);
}

export async function deleteQuote(quoteId: string): Promise<void> {
  const db = getAdminDb();
  const lines = await db
    .collection("quoteLines")
    .where("quoteId", "==", quoteId)
    .get();
  const batch = db.batch();
  for (const doc of lines.docs) batch.delete(doc.ref);
  batch.delete(db.collection("quotes").doc(quoteId));
  await batch.commit();
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
  const db = getAdminDb();
  const existing = await db
    .collection("quoteLines")
    .where("quoteId", "==", input.quoteId)
    .get();
  const existingLines = existing.docs.map((d) => mapQuoteLine(d.id, d.data()));
  let sortOrder = existing.size;
  const now = new Date();
  const batch = db.batch();
  const created: QuoteLine[] = [];

  for (const material of input.materials) {
    const already = existing.docs.some(
      (d) => d.data().materialId === material.materialId,
    );
    if (already) continue;

    const id = createId("qline");
    const payload = {
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
    batch.set(db.collection("quoteLines").doc(id), payload);
    created.push(mapQuoteLine(id, payload));
    sortOrder += 1;
  }

  batch.update(db.collection("quotes").doc(input.quoteId), {
    updatedAt: now,
    costs: quoteCostsFromLines([...existingLines, ...created]),
  });
  await batch.commit();
  return created;
}

export async function updateQuoteLine(
  lineId: string,
  data: Partial<Pick<QuoteLine, "quantity" | "sortOrder" | "unitCost" | "unit">>,
): Promise<QuoteLine> {
  const ref = getAdminDb().collection("quoteLines").doc(lineId);
  const existing = await ref.get();
  if (!existing.exists) throw new Error("Quote line not found");
  const now = new Date();
  await ref.update(
    stripUndefined({
      quantity: data.quantity,
      sortOrder: data.sortOrder,
      unitCost: data.unitCost,
      unit: data.unit,
      updatedAt: now,
    }),
  );
  const quoteId = existing.data()!.quoteId as string;
  await getAdminDb().collection("quotes").doc(quoteId).update({
    updatedAt: now,
    costs: await recalcQuoteCosts(quoteId),
  });
  const snap = await ref.get();
  return mapQuoteLine(snap.id, snap.data()!);
}

export async function deleteQuoteLine(lineId: string): Promise<void> {
  const ref = getAdminDb().collection("quoteLines").doc(lineId);
  const existing = await ref.get();
  if (!existing.exists) return;
  const quoteId = existing.data()!.quoteId as string;
  await ref.delete();
  await getAdminDb().collection("quotes").doc(quoteId).update({
    updatedAt: new Date(),
    costs: await recalcQuoteCosts(quoteId),
  });
}

export async function getQuoteLineById(
  lineId: string,
): Promise<QuoteLine | null> {
  const snap = await getAdminDb().collection("quoteLines").doc(lineId).get();
  if (!snap.exists) return null;
  return mapQuoteLine(snap.id, snap.data()!);
}

/** Clona una cotización (campos + líneas) hacia otro u el mismo proyecto. */
export async function cloneQuoteToProject(input: {
  sourceQuoteId: string;
  targetProjectId: string;
  quoteCode: string;
  title?: string;
}): Promise<QuoteWithLines> {
  const source = await getQuoteById(input.sourceQuoteId);
  if (!source) throw new Error("Quote not found");

  const db = getAdminDb();
  const id = createId("quote");
  const now = new Date();
  const quoteCode = input.quoteCode.trim();
  const quotePayload = {
    projectId: input.targetProjectId,
    quoteCode,
    title: input.title?.trim() || `Cotización #${quoteCode}`,
    status: "DRAFT" as QuoteStatus,
    commercialStatus: "NONE" as QuoteCommercialStatus,
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
    costs: source.costs ?? quoteCostsFromLines(source.lines),
    createdAt: now,
    updatedAt: now,
  };

  const batch = db.batch();
  batch.set(db.collection("quotes").doc(id), quotePayload);

  const lines: QuoteLine[] = [];
  for (const line of source.lines) {
    const lineId = createId("qline");
    const linePayload = {
      quoteId: id,
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
    };
    batch.set(db.collection("quoteLines").doc(lineId), linePayload);
    lines.push(mapQuoteLine(lineId, linePayload));
  }

  await batch.commit();
  return { ...mapQuote(id, quotePayload), lines };
}
