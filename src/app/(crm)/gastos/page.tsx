import { startOfDay, endOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { TopBar } from "@/components/crm/TopBar";
import { PageBody } from "@/components/crm/PageBody";
import { ProjectExpensesClient } from "@/components/crm/ProjectExpensesClient";
import { buildExpenseDashboard } from "@/lib/crm/project-expense-metrics";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { db } from "@/lib/db";

const TZ = "America/Santiago";

export default async function ProjectExpensesPage() {
  await requirePageSession();

  const now = new Date();
  const zonedNow = toZonedTime(now, TZ);
  const yearStart = new Date(zonedNow);
  yearStart.setMonth(0, 1);
  const rangeFrom = fromZonedTime(startOfDay(yearStart), TZ);
  const rangeTo = fromZonedTime(endOfDay(zonedNow), TZ);

  const [projects, expenses] = await Promise.all([
    db.listProjects(),
    db.listAllProjectExpenses(),
  ]);

  const dashboard = buildExpenseDashboard({
    projects,
    expenses,
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
