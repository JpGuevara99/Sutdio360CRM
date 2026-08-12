import { TopBar } from "@/components/crm/TopBar";
import { PageBody } from "@/components/crm/PageBody";
import { ManualLeadForm } from "@/components/crm/ManualLeadForm";

export default function NewLeadPage() {
  return (
    <>
      <TopBar title="Nueva visita / lead" />
      <PageBody>
        <p className="mb-6 max-w-2xl text-sm text-muted">
          Usa este formulario para leads que llegan por WhatsApp, Instagram o
          llamada. Las reservas del link de Google Calendar se importan con
          “Sincronizar Calendar”.
        </p>
        <div className="rounded-xl border border-border bg-surface p-6">
          <ManualLeadForm />
        </div>
      </PageBody>
    </>
  );
}
