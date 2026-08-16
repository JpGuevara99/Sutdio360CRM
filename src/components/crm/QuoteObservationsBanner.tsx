import {
  QUOTE_PAYMENT_METHODS,
  QUOTE_VALIDITY_DAYS,
} from "@/lib/crm/company";

const ACCENT = "#e31e26";

export function QuoteObservationsBanner({
  warrantyMonths,
  installmentCount,
  installmentInterestFree,
}: {
  warrantyMonths: number;
  installmentCount: number;
  installmentInterestFree: boolean;
}) {
  const months = Math.max(0, Math.floor(warrantyMonths));
  const cuotas = Math.max(0, Math.floor(installmentCount));
  const showBadge = installmentInterestFree && cuotas > 0;

  return (
    <section className="mt-4 border-y border-neutral-300 text-sm text-black">
      <div className="grid grid-cols-1 divide-y divide-neutral-200 md:grid-cols-3 md:divide-x md:divide-y-0 md:divide-neutral-300">
        {/* Garantía */}
        <div className="px-3 py-3.5 md:px-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            Garantía
          </p>
          <p className="mt-1 font-semibold text-neutral-900">
            <span className="tabular-nums" style={{ color: ACCENT }}>
              {months}
            </span>
            <span className="text-neutral-900">
              {" "}
              {months === 1 ? "mes" : "meses"}
            </span>
          </p>
          <p className="mt-2 text-xs text-neutral-600">
            Por el servicio de{" "}
            <span className="font-semibold text-neutral-900">instalación</span>
          </p>
        </div>

        {/* Pago / vigencia */}
        <div className="flex flex-col justify-center gap-3 px-3 py-3.5 md:px-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              Forma de pago
            </p>
            <p className="mt-0.5 text-neutral-900">{QUOTE_PAYMENT_METHODS}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              Vigencia del presupuesto
            </p>
            <p className="mt-0.5 font-semibold tabular-nums text-neutral-900">
              <span style={{ color: ACCENT }}>{QUOTE_VALIDITY_DAYS}</span> días
            </p>
          </div>
        </div>

        {/* Cuotas */}
        <div className="px-3 py-3.5 md:px-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            Financiamiento
          </p>
          <p className="mt-1 font-semibold text-neutral-900">
            Hasta{" "}
            <span className="tabular-nums" style={{ color: ACCENT }}>
              {cuotas}
            </span>{" "}
            {cuotas === 1 ? "cuota" : "cuotas"}
          </p>
          {showBadge ? (
            <p
              className="mt-1 text-xs font-semibold uppercase tracking-wide"
              style={{ color: ACCENT }}
            >
              Sin interés
            </p>
          ) : null}
          <p className="mt-2 text-xs text-neutral-600">
            En cualquiera de nuestros productos
          </p>
        </div>
      </div>
    </section>
  );
}
