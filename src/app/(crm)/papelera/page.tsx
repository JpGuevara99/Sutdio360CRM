import { requirePageSession } from "@/lib/auth/require-page-session";
import { TopBar } from "@/components/crm/TopBar";
import { PageBody } from "@/components/crm/PageBody";
import { TrashClient, type TrashItem } from "@/components/crm/TrashClient";
import { clientFullName } from "@/lib/crm/labels";
import { formatEntityCode } from "@/lib/crm/project-codes";
import {
  getTrashContents,
  purgeExpiredTrash,
  trashDaysLeft,
} from "@/lib/crm/trash";

export default async function TrashPage() {
  const session = await requirePageSession();

  // Lo que ya cumplió su plazo se descarta al abrir la papelera
  try {
    await purgeExpiredTrash();
  } catch (error) {
    console.error("TrashPage: purgeExpiredTrash failed", error);
  }

  const trash = await getTrashContents();

  const clientItems: TrashItem[] = trash.clients.map((client) => ({
    kind: "client",
    id: client.id,
    code: formatEntityCode(client.leadCode),
    title: clientFullName(client),
    subtitle: client.phone ?? client.email ?? client.address ?? null,
    deletedAt: (client.deletedAt ?? client.updatedAt).toISOString(),
    daysLeft: trashDaysLeft(client.deletedAt ?? client.updatedAt),
    children: client.projects.map((project) => ({
      code: formatEntityCode(project.publicCode),
      title: project.title ?? "Sin título",
    })),
  }));

  const projectItems: TrashItem[] = trash.projects.map((project) => ({
    kind: "project",
    id: project.id,
    code: formatEntityCode(project.publicCode),
    title: project.title ?? "Sin título",
    subtitle: project.client ? clientFullName(project.client) : null,
    deletedAt: (project.deletedAt ?? project.updatedAt).toISOString(),
    daysLeft: trashDaysLeft(project.deletedAt ?? project.updatedAt),
    children: [],
  }));

  return (
    <>
      <TopBar title="Papelera de Reciclaje" />
      <PageBody fill>
        <TrashClient
          items={[...clientItems, ...projectItems]}
          retentionDays={trash.retentionDays}
          isAdmin={session.role === "ADMIN"}
        />
      </PageBody>
    </>
  );
}
