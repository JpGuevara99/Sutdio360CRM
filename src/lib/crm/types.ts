export type ProjectStatus =
  | "RESERVADO"
  | "VISITADO"
  | "COTIZADO"
  | "SEGUIMIENTO"
  | "APROBADO"
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
  createdAt: Date;
  updatedAt: Date;
};

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

export type QuoteStatus = "DRAFT" | "FINAL";

export type Quote = {
  id: string;
  projectId: string;
  title: string;
  status: QuoteStatus;
  /** % sobre el subtotal de materiales */
  mermaPercent: number;
  /** % sobre Mano de Obra + Logística + Materiales */
  utilidadPercent: number;
  /** % sobre los subtotales anteriores + merma + utilidad */
  extraPercent: number;
  /** % de descuento sobre el subtotal neto */
  discountPercent: number;
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
