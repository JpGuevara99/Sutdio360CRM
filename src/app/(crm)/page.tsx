import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { startOfDay, endOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { TopBar } from "@/components/crm/TopBar";
import { PageBody, FillPanel } from "@/components/crm/PageBody";
import { StatusBadge } from "@/components/crm/StatusBadge";
import { SyncButtons } from "@/components/crm/SyncButtons";
import { clientFullName } from "@/lib/crm/labels";
import { formatEntityCode } from "@/lib/crm/project-codes";
import { db, usingFirestore } from "@/lib/db";

const TZ = "America/Santiago";

export default async function DashboardPage() {
  const now = new Date();
  const zonedNow = toZonedTime(now, TZ);
  const dayStart = fromZonedTime(startOfDay(zonedNow), TZ);
  const dayEnd = fromZonedTime(endOfDay(zonedNow), TZ);

  const [visitsToday, reservados, projects] = await Promise.all([
    db.countVisitsBetween(dayStart, dayEnd),
    db.countProjectsByStatus("RESERVADO"),
    db.listProjects(),
  ]);

  const listed = projects.slice(0, 12);

  return (
    <>
      <TopBar title="Dashboard CRM" />
      <PageBody fill className="gap-6">
        <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
          <p className="max-w-xl text-sm text-muted">
            Visitas y proyectos en curso. Las reservas del Appointment Schedule
            aparecen al sincronizar Calendar.
            {!usingFirestore() ? (
              <span className="mt-1 block text-[#b06000]">
                Modo local: datos en archivo (sin Firestore). Configura Firebase
                Admin para usar Firestore en la nube.
              </span>
            ) : null}
          </p>
          <SyncButtons />
        </div>

        <section className="grid shrink-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Visitas hoy" value={visitsToday} />
          <StatCard label="Proyectos reservados" value={reservados} />
          <StatCard label="Proyectos listados" value={listed.length} />
          <StatCard
            label="Base de datos"
            value={usingFirestore() ? "Firestore" : "Local"}
            isText
          />
        </section>

        <FillPanel>
          <div className="shrink-0 border-b border-border px-5 py-4">
            <h2 className="text-base font-medium text-foreground">Proyectos</h2>
          </div>
          <ul className="crm-scroll min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {listed.length === 0 ? (
              <li className="px-5 py-8 text-sm text-muted">
                Aún no hay proyectos. Sincroniza Calendar o crea una visita
                manual.
              </li>
            ) : (
              listed.map((project) => {
                const visit = project.visits[0];
                return (
                  <li key={project.id}>
                    <Link
                      href={`/proyectos/${project.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-surface-muted"
                    >
                      <div>
                        <p className="font-medium text-foreground">
                          {formatEntityCode(project.publicCode)}{" "}
                          <span className="font-normal text-muted">
                            · {clientFullName(project.client)}
                          </span>
                        </p>
                        <p className="text-sm text-muted">
                          {project.client.address ?? "Sin dirección"}
                          {visit
                            ? ` · ${formatInTimeZone(visit.scheduledAt, TZ, "dd MMM yyyy · HH:mm")}`
                            : null}
                        </p>
                      </div>
                      <StatusBadge status={project.status} />
                    </Link>
                  </li>
                );
              })
            )}
          </ul>
        </FillPanel>
      </PageBody>
    </>
  );
}

function StatCard({
  label,
  value,
  isText,
}: {
  label: string;
  value: number | string;
  isText?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-4">
      <p className="text-sm text-muted">{label}</p>
      <p
        className={`mt-1 ${isText ? "text-xl font-medium" : "text-3xl font-semibold"} text-foreground`}
      >
        {value}
      </p>
    </div>
  );
}
