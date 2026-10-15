import { startOfDay, endOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { TopBar } from "@/components/crm/TopBar";
import { PageBody } from "@/components/crm/PageBody";
import { ProjectExpensesClient } from "@/components/crm/ProjectExpensesClient";
import { loadProjectExpenseDashboard } from "@/lib/crm/load-project-expense-dashboard";
import { requirePageSession } from "@/lib/auth/require-page-session";

const TZ = "America/Santiago";

export default async function ProjectExpensesPage() {
  await requirePageSession();

  const now = new Date();
  const zonedNow = toZonedTime(now, TZ);
  const yearStart = new Date(zonedNow);
  yearStart.setMonth(0, 1);
  const rangeFrom = fromZonedTime(startOfDay(yearStart), TZ);
  const rangeTo = fromZonedTime(endOfDay(zonedNow), TZ);

  const dashboard = await loadProjectExpenseDashboard({
    from: rangeFrom,
    to: rangeTo,
    granularity: "month",
  });

  return (
    <>
      <TopBar title="Gastos" />
      <PageBody>
        <ProjectExpensesClient initial={dashboard} />
      </PageBody>
    </>
  );
}
