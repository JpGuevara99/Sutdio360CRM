import Link from "next/link";
import { notFound } from "next/navigation";
import { TopBar } from "@/components/crm/TopBar";
import { PageBody } from "@/components/crm/PageBody";
import { StatusBadge } from "@/components/crm/StatusBadge";
import { ClientEditForm } from "@/components/crm/ClientEditForm";
import { ensureClientDriveFolder } from "@/lib/crm/drive-sync";
import { clientFullName } from "@/lib/crm/labels";
import { formatEntityCode } from "@/lib/crm/project-codes";
import { db } from "@/lib/db";
import { isGoogleConfigured } from "@/lib/google/auth";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let client = await db.getClientWithProjects(id);
  if (!client) notFound();

  if (isGoogleConfigured() && !client.driveFolderId) {
    try {
      await ensureClientDriveFolder(id);
      client = (await db.getClientWithProjects(id)) ?? client;
    } catch (error) {
      console.error("Client Drive folder ensure failed", error);
    }
  }

  return (
    <>
      <TopBar title={clientFullName(client)} />
      <PageBody className="space-y-6">
        <section className="rounded-xl border border-border bg-surface p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-lg font-medium text-foreground">
              {formatEntityCode(client.leadCode)}
            </h2>
            {client.driveFolderUrl ? (
              <a
                href={client.driveFolderUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground transition hover:border-primary hover:bg-primary-soft/40"
              >
                <GoogleDriveIcon />
                <span className="font-medium">Abrir carpeta en Drive</span>
              </a>
            ) : (
              <p className="text-xs text-muted">
                La carpeta Drive se crea al sincronizar un proyecto
              </p>
            )}
          </div>
          <ClientEditForm client={client} />
        </section>

        <section className="rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-5 py-4">
            <h3 className="text-sm font-medium text-foreground">Proyectos</h3>
            <p className="mt-0.5 text-xs text-muted">
              Cada proyecto tiene su carpeta dentro de la del cliente en Drive
            </p>
          </div>
          {client.projects.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted">Sin proyectos aún</p>
          ) : (
            <ul className="divide-y divide-border">
              {client.projects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/proyectos/${project.id}`}
                    className="flex items-center justify-between px-5 py-4 hover:bg-surface-muted"
                  >
                    <div>
                      <p className="font-medium text-foreground">
                        {formatEntityCode(project.publicCode)}
                      </p>
                      <p className="text-sm text-muted">
                        {project.title ?? "Sin título"}
                      </p>
                    </div>
                    <StatusBadge status={project.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </PageBody>
    </>
  );
}

function GoogleDriveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 87.3 78" aria-hidden>
      <path
        d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"
        fill="#0066da"
      />
      <path
        d="m43.65 25.35-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z"
        fill="#00a6f0"
      />
      <path
        d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.4-12.8c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.85 11.5z"
        fill="#00832d"
      />
      <path
        d="m43.65 25.35 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"
        fill="#00832d"
      />
      <path
        d="m59.8 53.25h27.5c0-1.55-.4-3.1-1.2-4.5l-7.4-12.8-1.6-2.75c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8z"
        fill="#ea4335"
      />
      <path
        d="m59.8 53.25-5.85-11.5-10.3-20.4-10.3 20.4-5.85 11.5z"
        fill="#2684fc"
      />
    </svg>
  );
}
