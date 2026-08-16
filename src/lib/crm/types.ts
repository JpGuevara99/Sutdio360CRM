export type ProjectStatus =
  | "RESERVADO"
  | "VISITADO"
  | "COTIZADO"
  | "SEGUIMIENTO"
  | "APROBADO"
  | "RECHAZADO"
  | "PRODUCCION"
  | "INSTALACION"
  | "GARANTIA"
  | "CERRADO";

export type VisitSource =
  | "APPOINTMENT_SCHEDULE"
  | "WHATSAPP"
  | "INSTAGRAM"
  | "PHONE"
  | "MANUAL";

export type StaffRole = "ADMIN" | "COMERCIAL" | "TECNICO";

export type FileKind = "PHOTO" | "SKETCH" | "QUOTE_PDF" | "OTHER";

export type MaterialUnit = "ML" | "M2" | "M3" | "UD" | "D";

export type MaterialCategory = {
  id: string;
  name: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
};

export type Material = {
  id: string;
  name: string;
  categoryId: string | null;
  unit: MaterialUnit;
  /** Precio de costo por unidad de medida */
  costPrice: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Días que un elemento permanece en la papelera antes de descartarse.
 * Coincide con la papelera de Drive, que purga por su cuenta a los 30 días.
 */
export const TRASH_RETENTION_DAYS = 30;

export type Client = {
  id: string;
  /** Código público del cliente, ej. C-01 */
  leadCode: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  driveFolderId: string | null;
  driveFolderUrl: string | null;
  /** Si está en la papelera, cuándo se envió */
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Conclusión comercial al cerrar un proyecto */
export type ProjectClosingOutcome = "APROBADO" | "RECHAZADO";

export type Project = {
  id: string;
  /** Código público del proyecto, ej. P-01 / P-120 */
  publicCode: string;
  clientId: string;
  status: ProjectStatus;
  /** Columna del pipeline Kanban */
  stageId: string | null;
  /** Orden dentro de la columna (menor = más arriba) */
  boardOrder: number;
  title: string | null;
  /** @deprecated Usar projectNotes; se migra a entradas al listar */
  notes: string | null;
  calendarEventId: string | null;
  driveFolderId: string | null;
  driveFolderUrl: string | null;
  driveSyncPending: boolean;
  /** Seguimientos ya cumplidos */
  followUpCount: number;
  /** Cuándo se inició la secuencia de seguimientos */
  followUpStartedAt: Date | null;
  /** Cuándo se cumplió el último seguimiento */
  followUpLastAt: Date | null;
  /** Número del seguimiento agendado (null si no hay uno pendiente) */
  followUpNextNumber: number | null;
  /** Fecha del seguimiento agendado */
  followUpNextAt: Date | null;
  /** Task de Google Tasks del seguimiento agendado */
  followUpTaskId: string | null;
  followUpTaskListId: string | null;
  /** Cierre comercial */
  closedAt: Date | null;
  closingOutcome: ProjectClosingOutcome | null;
  /** Cotización con la que se concretó (o rechazó) el proyecto */
  closedQuoteId: string | null;
  /** Monto confirmado al cerrar */
  closedAmount: number | null;
  /** Si está en la papelera, cuándo se envió */
  deletedAt: Date | null;
  /** Se envió a la papelera arrastrado por su cliente */
  deletedWithClient: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** Nota independiente en la ficha del proyecto (estilo timeline) */
export type ProjectNote = {
  id: string;
  projectId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
};

export type PipelineStage = {
  id: string;
  name: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
};

export type Visit = {
  id: string;
  projectId: string;
  /** Fecha/hora de la visita elegida (Google Appointment u otra) */
  scheduledAt: Date;
  /** Cuándo se agendó / reservó la cita (event.created o registro manual) */
  bookedAt: Date;
  durationMin: number;
  timezone: string;
  source: VisitSource;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StaffUser = {
  id: string;
  firebaseUid: string;
  email: string;
  displayName: string | null;
  role: StaffRole;
  createdAt: Date;
  updatedAt: Date;
};

/** Acciones sensibles que quedan registradas con autor y fecha. */
export type AuditAction =
  | "PROJECT_TRASH"
  | "CLIENT_TRASH"
  | "TRASH_RESTORE"
  | "TRASH_RESTORE_ALL"
  | "TRASH_PURGE"
  | "TRASH_PURGE_ALL"
  | "CLIENT_MERGE"
  | "QUOTE_DELETE"
  | "PIPELINE_STAGE_DELETE"
  | "SETTINGS_UPDATE";

export type AuditLog = {
  id: string;
  action: AuditAction;
  /** Correo de la sesión que ejecutó la acción */
  actorEmail: string;
  /** Identificador de lo afectado (proyecto, cliente, cotización…) */
  target: string | null;
  /** Resumen legible de lo que pasó */
  detail: string | null;
  createdAt: Date;
};

export type FileRef = {
  id: string;
  projectId: string;
  driveFileId: string;
  kind: FileKind;
  name: string;
  mimeType: string | null;
  webViewLink: string | null;
  createdAt: Date;
};

export type ChileAddress = {
  /** Calle, avenida o pasaje */
  street: string;
  /** Número de la propiedad (puede ser s/n) */
  number: string;
  /** Depto, oficina, villa u otro complemento */
  complement: string;
  commune: string;
  region: string;
};

export type CompanySettings = {
  commercialAddress: ChileAddress | null;
  /** Teléfono comercial que aparece en cotizaciones */
  phone: string | null;
  updatedAt: Date;
};

/** Configuración global de la secuencia de seguimientos comerciales */
export type FollowUpSettings = {
  /** Cantidad de seguimientos de la secuencia */
  count: number;
  /** Días de espera antes de cada seguimiento (largo = count) */
  intervalDays: number[];
  updatedAt: Date;
};

export type QuoteStatus = "DRAFT" | "FINAL";

/** Semáforo comercial (independiente de DRAFT/FINAL). */
export type QuoteCommercialStatus =
  | "NONE"
  | "SENT"
  | "ACCEPTED"
  | "REJECTED";

export const QUOTE_IVA_RATE = 0.19;

/**
 * Suma de costos de las líneas agrupada por tipo. Los porcentajes (merma,
 * utilidad, extra, descuento, IVA) se aplican sobre estos tres montos, así que
 * bastan para reconstruir cualquier total de la cotización.
 */
export type QuoteCosts = {
  labor: number;
  logistics: number;
  materials: number;
};

export type Quote = {
  id: string;
  projectId: string;
  /** Código único de cotización, ej. P1201 (sin la palabra "Cotización") */
  quoteCode: string | null;
  title: string;
  status: QuoteStatus;
  /** Estado comercial: sin asignar / enviado / aceptado / rechazado */
  commercialStatus: QuoteCommercialStatus;
  /** % sobre el subtotal de materiales */
  mermaPercent: number;
  /** % sobre Mano de Obra + Logística + Materiales */
  utilidadPercent: number;
  /** % sobre los subtotales anteriores + merma + utilidad */
  extraPercent: number;
  /** % de descuento sobre el subtotal neto */
  discountPercent: number;
  /** Si true, muestra Total + IVA (19%) bajo el total neto */
  includeIva: boolean;
  /** Meses de garantía mostrados en observaciones */
  warrantyMonths: number;
  /** Cantidad de cuotas mostradas en observaciones */
  installmentCount: number;
  /** Si es true, las cuotas se muestran como “Sin Interés” */
  installmentInterestFree: boolean;
  /** Texto libre de observaciones en la cotización (antes del banner) */
  observations: string;
  /** Si es false, no se muestran las observaciones en el documento */
  showObservations: boolean;
  /**
   * Costos por tipo, guardados en la cotización cada vez que cambian sus
   * líneas. Con ellos se calculan los totales sin volver a leer las líneas.
   * `null` = cotización antigua sin el dato (hay que calcularla desde líneas).
   */
  costs: QuoteCosts | null;
  createdAt: Date;
  updatedAt: Date;
};

export type QuoteLine = {
  id: string;
  quoteId: string;
  materialId: string;
  name: string;
  categoryId: string | null;
  categoryName: string;
  unit: MaterialUnit;
  unitCost: number;
  quantity: number;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type QuoteWithLines = Quote & {
  lines: QuoteLine[];
};

export type QuoteWithProject = Quote & {
  project: Project;
  client: Client;
  lines?: QuoteLine[];
};

export type ProjectWithRelations = Project & {
  client: Client;
  visits: Visit[];
  files?: FileRef[];
  projectNotes?: ProjectNote[];
  quotes?: Quote[];
};

export type ClientWithProjects = Client & {
  projects: Project[];
  projectCount: number;
};

/** Proyecto en la papelera, con su cliente para mostrarlo en la lista */
export type TrashedProject = Project & {
  client: Client | null;
};

/** Cliente en la papelera, con los proyectos que arrastró */
export type TrashedClient = Client & {
  projects: Project[];
};
