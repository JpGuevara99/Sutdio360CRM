import { startOfDay, endOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { TopBar } from "@/components/crm/TopBar";
import { PageBody } from "@/components/crm/PageBody";
import { DashboardClient } from "@/components/crm/DashboardClient";
import { buildDashboardMetrics } from "@/lib/crm/dashboard-metrics";
import { resolveQuoteCosts } from "@/lib/crm/quote-costs";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { db, usingFirestore } from "@/lib/db";

const TZ = "America/Santiago";

export default async function DashboardPage() {
  await requirePageSession();

  const now = new Date();
  const zonedNow = toZonedTime(now, TZ);
  const dayStart = fromZonedTime(startOfDay(zonedNow), TZ);
  const dayEnd = fromZonedTime(endOfDay(zonedNow), TZ);

  // Default: últimos 90 días
  const fromZoned = new Date(zonedNow);
  fromZoned.setDate(fromZoned.getDate() - 90);
  const rangeFrom = fromZonedTime(startOfDay(fromZoned), TZ);
  const rangeTo = dayEnd;

  const [visitsToday, reservados, projects, quotes] = await Promise.all([
    db.countVisitsBetween(dayStart, dayEnd),
    db.countProjectsByStatus("RESERVADO"),
    db.listProjects(),
    db.listAllQuotes(),
  ]);

  // Las métricas solo miran cotizaciones con estado comercial, y los costos
  // vienen guardados en cada una: no hace falta leer sus líneas.
  const costsByQuoteId = await resolveQuoteCosts(
    quotes.filter((quote) => (quote.commercialStatus ?? "NONE") !== "NONE"),
  );

  const metrics = buildDashboardMetrics({
    visitsToday,
    reservados,
    quotes,
    costsByQuoteId,
    projects,
    from: rangeFrom,
    to: rangeTo,
    segment: "ALL",
    amountMin: null,
    amountMax: null,
  });

  const initial = {
    metrics,
    recentProjects: projects.slice(0, 10).map((p) => ({
      id: p.id,
      publicCode: p.publicCode,
      status: p.status,
      clientName: `${p.client.firstName} ${p.client.lastName}`.trim(),
      address: p.client.address,
      visitAt: p.visits[0]?.scheduledAt?.toISOString() ?? null,
    })),
  };

  return (
    <>
      <TopBar title="Dashboard CRM" />
      <PageBody fill>
        <DashboardClient
          usingFirestore={usingFirestore()}
          initial={initial}
        />
      </PageBody>
    </>
  );
}
