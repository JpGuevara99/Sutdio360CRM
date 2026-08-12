import { NextResponse } from "next/server";
import { startOfDay, endOfDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { getSessionFromRequest } from "@/lib/auth/session";
import { db } from "@/lib/db";

const TZ = "America/Santiago";

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const zonedNow = toZonedTime(now, TZ);
  const dayStart = fromZonedTime(startOfDay(zonedNow), TZ);
  const dayEnd = fromZonedTime(endOfDay(zonedNow), TZ);

  const [visitsToday, reservados, upcomingProjects] = await Promise.all([
    db.countVisitsBetween(dayStart, dayEnd),
    db.countProjectsByStatus("RESERVADO"),
    db.listProjects(),
  ]);

  return NextResponse.json({
    stats: {
      visitsToday,
      reservados,
    },
    upcomingProjects: upcomingProjects.slice(0, 10),
  });
}
