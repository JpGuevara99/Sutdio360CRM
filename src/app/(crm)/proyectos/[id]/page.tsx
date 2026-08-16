import Link from "next/link";
import { notFound } from "next/navigation";
import { es } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";
import { TopBar } from "@/components/crm/TopBar";
import { PageBody } from "@/components/crm/PageBody";
import { StatusBadge } from "@/components/crm/StatusBadge";
import { ProjectStatusForm } from "@/components/crm/ProjectStatusForm";
import { ProjectNotesPanel } from "@/components/crm/ProjectNotesPanel";
import { ProjectFilesPanel } from "@/components/crm/ProjectFilesPanel";
import { ProjectQuotesSection } from "@/components/crm/ProjectQuotesSection";
import { ProjectFollowUpPanel } from "@/components/crm/ProjectFollowUpPanel";
import { ClientEditForm } from "@/components/crm/ClientEditForm";
import { DeleteEntityAction } from "@/components/crm/DeleteEntityAction";
import { VISIT_SOURCE_LABELS, formatClp } from "@/lib/crm/labels";
import { formatEntityCode } from "@/lib/crm/project-codes";
import { formatQuoteCodeLabel } from "@/lib/crm/quote-codes";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { db } from "@/lib/db";

const TZ = "America/Santiago";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePageSession();
  const [project, quotes, followUpSettings] = await Promise.all([
    db.getProjectById(id),
    db.listQuotesByProject(id),
    db.getFollowUpSettings(),
  ]);
  if (!project) notFound();

  const closingQuote = project.closedQuoteId
    ? (quotes.find((q) => q.id === project.closedQuoteId) ?? null)
    : null;

  return (
    <>
      <TopBar title={formatEntityCode(project.publicCode)} />
      <PageBody className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-semibold text-foreground">
                {formatEntityCode(project.publicCode)}
              </h2>
              <StatusBadge status={project.status} />
              <span className="rounded bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-text">
                Cliente {formatEntityCode(project.client.leadCode)}
              </span>
            </div>
            <p className="text-muted">
              {project.title ?? "Proyecto sin título"}
            </p>
          </div>
          <ProjectStatusForm projectId={project.id} status={project.status} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-surface p-5">
            <h3 className="mb-3 text-sm font-medium text-foreground">Cliente</h3>
            <ClientEditForm client={project.client} />
            <p className="mt-3 text-xs text-muted">
              Ficha completa:{" "}
              <Link
                href={`/clientes/${project.client.id}`}
                className="text-primary hover:underline"
              >
                {formatEntityCode(project.client.leadCode)}
              </Link>
            </p>
          </section>

          <section className="rounded-xl border border-border bg-surface p-5">
            <h3 className="mb-3 text-sm font-medium text-foreground">
              Integraciones
            </h3>
            <dl className="space-y-2 text-sm">
              <Row
                label="Google Calendar"
                value={
                  project.calendarEventId ? (
                    <span className="break-all">
                      Evento ID: {project.calendarEventId}
                    </span>
                  ) : (
                    "Sin evento (lead manual)"
                  )
                }
              />
              <Row
                label="Google Drive"
                value={
                  project.driveFolderUrl ? (
                    <a
                      href={project.driveFolderUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      Abrir carpeta del proyecto
                    </a>
                  ) : project.driveSyncPending ? (
                    <span className="text-[#b06000]">
                      Sync pendiente — usa Reintentar Drive
                    </span>
                  ) : (
                    "Sin carpeta"
                  )
                }
              />
            </dl>
          </section>
        </div>

        {project.closedAt ? (
          <section className="rounded-xl border border-border bg-surface p-5">
            <h3 className="mb-3 text-sm font-medium text-foreground">Cierre</h3>
            <dl className="space-y-2 text-sm">
              <Row
                label="Conclusión"
                value={
                  project.closingOutcome === "APROBADO"
                    ? "Aprobado"
                    : project.closingOutcome === "RECHAZADO"
                      ? "Rechazado"
                      : "—"
                }
              />
              <Row
                label="Finalización"
                value={formatInTimeZone(project.closedAt, TZ, "dd/MM/yyyy")}
              />
              <Row
                label="Monto"
                value={
                  project.closedAmount != null
                    ? formatClp(project.closedAmount)
                    : "—"
                }
              />
              <Row
                label="Cotización"
                value={
                  closingQuote
                    ? (closingQuote.quoteCode
                        ? formatQuoteCodeLabel(closingQuote.quoteCode)
                        : closingQuote.title)
                    : "Sin cotización asociada"
                }
              />
            </dl>
          </section>
        ) : null}

        <ProjectFollowUpPanel
          projectId={project.id}
          publicCode={project.publicCode}
          status={project.status}
          settings={followUpSettings}
          followUpCount={project.followUpCount ?? 0}
          followUpLastAt={project.followUpLastAt}
          followUpNextNumber={project.followUpNextNumber ?? null}
          followUpNextAt={project.followUpNextAt}
        />

        <ProjectQuotesSection projectId={project.id} quotes={quotes} />

        <section className="rounded-xl border border-border bg-surface p-5">
          <ProjectNotesPanel
            key={project.id}
            projectId={project.id}
            initialNotes={(project.projectNotes ?? []).map((n) => ({
              id: n.id,
              body: n.body,
              createdAt: n.createdAt.toISOString(),
            }))}
          />
        </section>

        <ProjectFilesPanel
          projectId={project.id}
          files={project.files ?? []}
          driveFolderUrl={project.driveFolderUrl}
        />

        <section className="rounded-xl border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-medium text-foreground">Visitas</h3>
          <ul className="divide-y divide-border">
            {project.visits.map((visit) => (
              <li
                key={visit.id}
                className="flex flex-wrap justify-between gap-2 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-foreground">
                    Visita:{" "}
                    {formatInTimeZone(
                      visit.scheduledAt,
                      TZ,
                      "EEEE d MMMM yyyy · HH:mm",
                      { locale: es },
                    )}
                  </p>
                  <p className="text-muted-strong">
                    Agendado:{" "}
                    {formatInTimeZone(
                      visit.bookedAt,
                      TZ,
                      "dd/MM/yyyy HH:mm",
                    )}
                  </p>
                  <p className="text-muted">
                    {VISIT_SOURCE_LABELS[visit.source]} · {visit.durationMin}{" "}
                    min · {visit.timezone}
                  </p>
                  {visit.notes ? (
                    <p className="mt-1 whitespace-pre-wrap text-muted-strong">
                      Notas de la cita: {visit.notes}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {project.deletedAt ? (
          <section className="rounded-xl border border-[#d93025]/40 bg-[#d93025]/5 p-4">
            <p className="text-sm text-[#d93025]">
              Este proyecto está en la Papelera de Reciclaje. Restáuralo desde{" "}
              <Link href="/papelera" className="underline">
                Papelera de Reciclaje
              </Link>
              .
            </p>
          </section>
        ) : (
          <div className="flex justify-end pb-2">
            <DeleteEntityAction
              kind="project"
              id={project.id}
              label={formatEntityCode(project.publicCode)}
            />
          </div>
        )}
      </PageBody>
    </>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
