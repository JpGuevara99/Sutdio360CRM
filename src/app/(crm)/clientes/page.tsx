import Link from "next/link";
import { TopBar } from "@/components/crm/TopBar";
import { PageBody, FillPanel } from "@/components/crm/PageBody";
import { clientFullName } from "@/lib/crm/labels";
import { formatEntityCode } from "@/lib/crm/project-codes";
import { db } from "@/lib/db";

export default async function ClientsPage() {
  const clients = await db.listClients();

  return (
    <>
      <TopBar title="Clientes" />
      <PageBody fill>
        <FillPanel>
          <div className="crm-scroll min-h-0 flex-1 overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-surface-muted text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 font-medium">Dirección</th>
                <th className="px-4 py-3 font-medium">Proyectos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-surface-muted">
                  <td className="px-4 py-3">
                    <Link
                      href={`/clientes/${client.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {formatEntityCode(client.leadCode)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/clientes/${client.id}`}
                      className="text-primary hover:underline"
                    >
                      {clientFullName(client)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-strong">
                    <div>{client.email ?? "—"}</div>
                    <div className="text-muted">{client.phone ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {client.address ?? "—"}
                  </td>
                  <td className="px-4 py-3">{client.projectCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {clients.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted">
              Aún no hay clientes.
            </p>
          ) : null}
          </div>
        </FillPanel>
      </PageBody>
    </>
  );
}
