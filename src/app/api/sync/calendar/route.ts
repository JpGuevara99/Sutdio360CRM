import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { syncAppointmentsFromCalendar } from "@/lib/crm/ingest-appointment";

function authorized(request: Request): Promise<boolean> | boolean {
  const cronSecret = process.env.CRON_SECRET;
  const header = request.headers.get("x-cron-secret");
  if (cronSecret && header === cronSecret) return true;
  return getSessionFromRequest(request).then((s) => Boolean(s));
}

export async function POST(request: Request) {
  if (!(await authorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const forceFull = searchParams.get("force") === "1";

  try {
    const result = await syncAppointmentsFromCalendar({ forceFull: true });
    // Always do a windowed full scan for manual button presses so new bookings
    // are not missed behind a stale sync token / busy calendar backlog.
    void forceFull;
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Calendar sync failed";
    return NextResponse.json({ error: message, ok: false }, { status: 500 });
  }
}
