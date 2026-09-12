import { NextResponse } from "next/server";
import { endOfDay, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { getSessionFromRequest } from "@/lib/auth/session";
import {
  buildExpenseDashboard,
  type ExpenseGranularity,
} from "@/lib/crm/project-expense-metrics";
import { db } from "@/lib/db";

const TZ = "America/Santiago";

function parseDateParam(
  raw: string | null,
  bound: "start" | "end",
): Date | null {
  if (!raw?.trim()) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    const zoned = toZonedTime(new Date(`${raw.trim()}T12:00:00`), TZ);
    const local = bound === "start" ? startOfDay(zoned) : endOfDay(zoned);
    return fromZonedTime(local, TZ);
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseGranularity(raw: string | null): ExpenseGranularity {
  if (raw === "day" || raw === "week" || raw === "month") return raw;
  return "month";
}

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = parseDateParam(searchParams.get("from"), "start");
  const to = parseDateParam(searchParams.get("to"), "end");
  const query = searchParams.get("q") ?? "";
  const granularity = parseGranularity(searchParams.get("granularity"));

  const [projects, expenses] = await Promise.all([
    db.listProjects(),
    db.listAllProjectExpenses(),
  ]);

  const dashboard = buildExpenseDashboard({
    projects,
    expenses,
    from,
    to,
    query,
    granularity,
  });

  return NextResponse.json({ dashboard });
}
