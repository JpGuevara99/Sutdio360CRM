import { NextResponse } from "next/server";
import { endOfDay, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { getSessionFromRequest } from "@/lib/auth/session";
import {
  buildDashboardMetrics,
  type DashboardSegment,
} from "@/lib/crm/dashboard-metrics";
import { resolveQuoteCosts } from "@/lib/crm/quote-costs";
import { db } from "@/lib/db";

const TZ = "America/Santiago";

function parseDateParam(
  raw: string | null,
  bound: "start" | "end",
): Date | null {
  if (!raw?.trim()) return null;
  // YYYY-MM-DD → día civil en America/Santiago
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    const zoned = toZonedTime(new Date(`${raw.trim()}T12:00:00`), TZ);
    const local =
      bound === "start" ? startOfDay(zoned) : endOfDay(zoned);
    return fromZonedTime(local, TZ);
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseSegment(
  raw: string | null,
): DashboardSegment | "ALL" {
  if (raw === "SENT" || raw === "ACCEPTED" || raw === "REJECTED") return raw;
  return "ALL";
}

function parseAmount(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = parseDateParam(searchParams.get("from"), "start");
  const to = parseDateParam(searchParams.get("to"), "end");
  const segment = parseSegment(searchParams.get("segment"));
  const amountMin = parseAmount(searchParams.get("amountMin"));
  const amountMax = parseAmount(searchParams.get("amountMax"));

  const now = new Date();
  const zonedNow = toZonedTime(now, TZ);
  const dayStart = fromZonedTime(startOfDay(zonedNow), TZ);
  const dayEnd = fromZonedTime(endOfDay(zonedNow), TZ);

  const [visitsToday, reservados, projects, quotes] = await Promise.all([
    db.countVisitsBetween(dayStart, dayEnd),
    db.countProjectsByStatus("RESERVADO"),
    db.listProjects(),
    db.listAllQuotes(),
  ]);

  // Los costos vienen guardados en cada cotización: sin leer líneas.
  const costsByQuoteId = await resolveQuoteCosts(
    quotes.filter((quote) => (quote.commercialStatus ?? "NONE") !== "NONE"),
  );

  const metrics = buildDashboardMetrics({
    visitsToday,
    reservados,
    quotes,
    costsByQuoteId,
    projects,
    from,
    to,
    segment,
    amountMin,
    amountMax,
  });

  return NextResponse.json({
    metrics,
    recentProjects: projects.slice(0, 10).map((p) => ({
      id: p.id,
      publicCode: p.publicCode,
      status: p.status,
      clientName: `${p.client.firstName} ${p.client.lastName}`.trim(),
      address: p.client.address,
      visitAt: p.visits[0]?.scheduledAt?.toISOString() ?? null,
    })),
  });
}
