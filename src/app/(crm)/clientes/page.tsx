import { TopBar } from "@/components/crm/TopBar";
import { PageBody } from "@/components/crm/PageBody";
import { ClientsIndexClient } from "@/components/crm/ClientsIndexClient";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { db } from "@/lib/db";

export default async function ClientsPage() {
  const [session, clients] = await Promise.all([
    requirePageSession(),
    db.listClients(),
  ]);

  return (
    <>
      <TopBar title="Clientes" />
      <PageBody fill>
        <ClientsIndexClient
          clients={clients}
          canMerge={session.role === "ADMIN"}
        />
      </PageBody>
    </>
  );
}
