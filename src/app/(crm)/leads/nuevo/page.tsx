import { TopBar } from "@/components/crm/TopBar";
import { PageBody } from "@/components/crm/PageBody";
import { ProjectCreateForm } from "@/components/crm/ProjectCreateForm";
import { requirePageSession } from "@/lib/auth/require-page-session";

export default async function NewLeadPage() {
  await requirePageSession();

  return (
    <>
      <TopBar title="Nuevo Lead / Proyecto" />
      <PageBody>
        <p className="mb-6 max-w-2xl text-sm text-muted">
          Crea el proyecto a mano: con un cliente nuevo, que recibe su propio
          código, o sobre un cliente existente, que mantiene el suyo. Si el lead
          llegó con visita agendada, márcala aquí; las reservas del link de
          Google Calendar se importan con “Sincronizar Calendar”.
        </p>
        <div className="max-w-3xl rounded-xl border border-border bg-surface p-6">
          <ProjectCreateForm />
        </div>
      </PageBody>
    </>
  );
}
