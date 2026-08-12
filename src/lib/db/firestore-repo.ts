import {
  FieldValue,
  type DocumentData,
  type Query,
} from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { createId, stripUndefined, toDate } from "@/lib/db/serialize";
import type {
  ChileAddress,
  Client,
  ClientWithProjects,
  CompanySettings,
  FileKind,
  FileRef,
  Material,
  MaterialCategory,
  MaterialUnit,
  PipelineStage,
  Project,
  ProjectNote,
  ProjectStatus,
  ProjectWithRelations,
  Quote,
  QuoteLine,
  QuoteStatus,
  QuoteWithLines,
  QuoteWithProject,
  StaffUser,
  Visit,
  VisitSource,
} from "@/lib/crm/types";
import { DEFAULT_PIPELINE_STAGES, sortStages } from "@/lib/crm/pipeline";
import {
  DEFAULT_MATERIAL_CATEGORIES,
  sortMaterialCategories,
} from "@/lib/crm/material-categories";
import { buildEntityCode } from "@/lib/crm/project-codes";
import { sanitizeChileAddress } from "@/lib/crm/chile-address";

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
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function mapProject(id: string, data: DocumentData): Project {
  const createdAt = toDate(data.createdAt);
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

async function getVisitsForProject(projectId: string): Promise<Visit[]> {
  const db = getAdminDb();
  const snap = await db
    .collection("visits")
    .where("projectId", "==", projectId)
    .get();
  return snap.docs
    .map((doc) => mapVisit(doc.id, doc.data()))
    .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());
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
      .limit(1)
      .get();
    if (!existing.empty) {
      const doc = existing.docs[0];
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
      .limit(1)
      .get();
    if (!existing.empty) {
      const doc = existing.docs[0];
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
  const db = getAdminDb();
  const clientsSnap = await db.collection("clients").get();
  const projectsSnap = await db.collection("projects").get();
  const projects = projectsSnap.docs.map((d) => mapProject(d.id, d.data()));

  return clientsSnap.docs
    .map((doc) => {
      const client = mapClient(doc.id, doc.data());
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
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return { ...client, projects, projectCount: projects.length };
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
    createdAt: now,
    updatedAt: now,
  };
  await db.collection("projects").doc(id).set(payload);
  return mapProject(id, payload);
}

export async function reorderProjectsInStage(
  stageId: string,
  orderedIds: string[],
): Promise<void> {
  const db = getAdminDb();
  const batch = db.batch();
  const now = new Date();
  orderedIds.forEach((id, index) => {
    batch.update(db.collection("projects").doc(id), {
      stageId,
      boardOrder: index,
      updatedAt: now,
    });
  });
  await batch.commit();
}

export async function updateProject(
  id: string,
  data: Partial<
    Pick<
      Project,
      | "status"
      | "stageId"
      | "boardOrder"
      | "title"
      | "notes"
      | "driveFolderId"
      | "driveFolderUrl"
      | "driveSyncPending"
      | "calendarEventId"
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
  const snap = await getAdminDb().collection("projects").doc(id).get();
  if (!snap.exists) return null;
  const project = mapProject(snap.id, snap.data()!);
  const client = await getClientById(project.clientId);
  if (!client) return null;
  const [visits, files, projectNotes] = await Promise.all([
    getVisitsForProject(project.id),
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
  const db = getAdminDb();
  let query: Query = db.collection("projects");
  if (options?.status) {
    query = query.where("status", "==", options.status);
  }

  // 3 lecturas en lote en vez de 1 + 2N (clientes/visitas por proyecto).
  const [projectsSnap, clientsSnap, visitsSnap] = await Promise.all([
    query.get(),
    db.collection("clients").get(),
    db.collection("visits").get(),
  ]);

  const clientsById = new Map(
    clientsSnap.docs.map((d) => [d.id, mapClient(d.id, d.data())]),
  );

  const visitsByProject = new Map<string, Visit[]>();
  for (const doc of visitsSnap.docs) {
    const visit = mapVisit(doc.id, doc.data());
    const list = visitsByProject.get(visit.projectId) ?? [];
    list.push(visit);
    visitsByProject.set(visit.projectId, list);
  }
  for (const list of visitsByProject.values()) {
    list.sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());
  }

  return projectsSnap.docs
    .map((d) => mapProject(d.id, d.data()))
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
  const snap = await getAdminDb().collection("visits").get();
  return snap.docs.filter((doc) => {
    const at = toDate(doc.data().scheduledAt).getTime();
    return at >= start.getTime() && at <= end.getTime();
  }).length;
}

export async function countProjectsByStatus(
  status: ProjectStatus,
): Promise<number> {
  const snap = await getAdminDb()
    .collection("projects")
    .where("status", "==", status)
    .get();
  return snap.size;
}

export async function listPendingDriveProjects(): Promise<Project[]> {
  const snap = await getAdminDb()
    .collection("projects")
    .where("driveSyncPending", "==", true)
    .limit(50)
    .get();
  return snap.docs.map((d) => mapProject(d.id, d.data()));
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
  const snap = await db.collection("pipelineStages").get();
  if (snap.empty) {
    return ensureDefaultPipelineStages();
  }
  const stages = sortStages(snap.docs.map((d) => mapStage(d.id, d.data())));
  await assignMissingProjectStages(stages[0]?.id ?? null);
  return stages;
}

export async function ensureDefaultPipelineStages(): Promise<PipelineStage[]> {
  const db = getAdminDb();
  const existing = await db.collection("pipelineStages").get();
  if (!existing.empty) {
    return sortStages(existing.docs.map((d) => mapStage(d.id, d.data())));
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
  const snap = await db.collection("projects").get();
  const batch = db.batch();
  let writes = 0;
  for (const doc of snap.docs) {
    if (!doc.data().stageId) {
      batch.update(doc.ref, { stageId: fallbackStageId, updatedAt: new Date() });
      writes += 1;
    }
  }
  if (writes > 0) await batch.commit();
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
  const batch = db.batch();
  orderedIds.forEach((id, index) => {
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
  const snap = await getAdminDb().collection("materialCategories").get();
  if (snap.empty) return ensureDefaultMaterialCategories();
  return sortMaterialCategories(
    snap.docs.map((d) => mapMaterialCategory(d.id, d.data())),
  );
}

export async function ensureDefaultMaterialCategories(): Promise<
  MaterialCategory[]
> {
  const db = getAdminDb();
  const existing = await db.collection("materialCategories").get();
  if (!existing.empty) {
    return sortMaterialCategories(
      existing.docs.map((d) => mapMaterialCategory(d.id, d.data())),
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
  const snap = await getAdminDb().collection("materials").get();
  return snap.docs
    .map((d) => mapMaterial(d.id, d.data()))
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

function mapQuote(id: string, data: DocumentData): Quote {
  return {
    id,
    projectId: data.projectId,
    title: data.title ?? "Presupuesto",
    status: (data.status as QuoteStatus) ?? "DRAFT",
    mermaPercent: Number(data.mermaPercent ?? 0),
    utilidadPercent: Number(data.utilidadPercent ?? 0),
    extraPercent: Number(data.extraPercent ?? 0),
    discountPercent: Number(data.discountPercent ?? 0),
    warrantyMonths: Number(data.warrantyMonths ?? 0),
    installmentCount: Number(data.installmentCount ?? 0),
    installmentInterestFree: Boolean(data.installmentInterestFree),
    observations:
      typeof data.observations === "string" ? data.observations : "",
    showObservations: data.showObservations !== false,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
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
  const snap = await getAdminDb()
    .collection("quotes")
    .where("projectId", "==", projectId)
    .get();
  return snap.docs
    .map((d) => mapQuote(d.id, d.data()))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function listRecentQuotes(
  limit = 50,
): Promise<QuoteWithProject[]> {
  const snap = await getAdminDb().collection("quotes").limit(limit * 2).get();
  const quotes = snap.docs
    .map((d) => mapQuote(d.id, d.data()))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, limit);

  const result: QuoteWithProject[] = [];
  for (const quote of quotes) {
    const project = await getProjectById(quote.projectId);
    if (!project) continue;
    result.push({
      ...quote,
      project,
      client: project.client,
    });
  }
  return result;
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

export async function createQuote(input: {
  projectId: string;
  title?: string;
}): Promise<Quote> {
  const db = getAdminDb();
  const id = createId("quote");
  const now = new Date();
  const payload = {
    projectId: input.projectId,
    title: input.title?.trim() || "Presupuesto de costos",
    status: "DRAFT" as QuoteStatus,
    mermaPercent: 0,
    utilidadPercent: 0,
    extraPercent: 0,
    discountPercent: 0,
    warrantyMonths: 0,
    installmentCount: 0,
    installmentInterestFree: false,
    observations: "",
    showObservations: true,
    createdAt: now,
    updatedAt: now,
  };
  await db.collection("quotes").doc(id).set(payload);
  return mapQuote(id, payload);
}

export async function updateQuote(
  quoteId: string,
  data: Partial<
    Pick<
      Quote,
      | "title"
      | "status"
      | "mermaPercent"
      | "utilidadPercent"
      | "extraPercent"
      | "discountPercent"
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
      mermaPercent: data.mermaPercent,
      utilidadPercent: data.utilidadPercent,
      extraPercent: data.extraPercent,
      discountPercent: data.discountPercent,
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
  });
  await batch.commit();
  return created;
}

export async function updateQuoteLine(
  lineId: string,
  data: Partial<Pick<QuoteLine, "quantity" | "sortOrder">>,
): Promise<QuoteLine> {
  const ref = getAdminDb().collection("quoteLines").doc(lineId);
  const existing = await ref.get();
  if (!existing.exists) throw new Error("Quote line not found");
  const now = new Date();
  await ref.update(
    stripUndefined({
      quantity: data.quantity,
      sortOrder: data.sortOrder,
      updatedAt: now,
    }),
  );
  const quoteId = existing.data()!.quoteId as string;
  await getAdminDb().collection("quotes").doc(quoteId).update({
    updatedAt: now,
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
  });
}

export async function getQuoteLineById(
  lineId: string,
): Promise<QuoteLine | null> {
  const snap = await getAdminDb().collection("quoteLines").doc(lineId).get();
  if (!snap.exists) return null;
  return mapQuoteLine(snap.id, snap.data()!);
}
