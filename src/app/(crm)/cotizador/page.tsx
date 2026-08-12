import { TopBar } from "@/components/crm/TopBar";
import { PageBody } from "@/components/crm/PageBody";
import {
  CotizadorIndexClient,
  type CotizadorProjectOption,
} from "@/components/crm/CotizadorIndexClient";
import { clientFullName } from "@/lib/crm/labels";
import { db } from "@/lib/db";

export default async function CotizadorIndexPage() {
  const [quotes, projects, company] = await Promise.all([
    db.listRecentQuotes(40),
    db.listProjects(),
    db.getCompanySettings(),
  ]);

  const projectOptions: CotizadorProjectOption[] = projects.map((p) => ({
    id: p.id,
    publicCode: p.publicCode,
    title: p.title,
    clientName: clientFullName(p.client),
    address: p.client.address,
  }));

  return (
    <>
      <TopBar title="Cotizador" />
      <PageBody fill>
        <CotizadorIndexClient
          quotes={quotes}
          projects={projectOptions}
          initialCompanySettings={{
            commercialAddress: company.commercialAddress,
            phone: company.phone,
          }}
        />
      </PageBody>
    </>
  );
}
