import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { isValidCronSecret } from "@/lib/auth/cron-secret";
import { syncAppointmentsFromCalendar } from "@/lib/crm/ingest-appointment";
import { formatGoogleAuthError } from "@/lib/google/auth";

async function authorized(request: Request): Promise<boolean> {
  if (isValidCronSecret(request.headers.get("x-cron-secret"))) return true;
  return Boolean(await getSessionFromRequest(request));
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
    return NextResponse.json(
      { error: formatGoogleAuthError(error), ok: false },
      { status: 500 },
    );
  }
}
