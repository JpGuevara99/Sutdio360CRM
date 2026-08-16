import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  AuthSessionError,
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  createSessionCookieValue,
  forgetCachedSessions,
  verifyIdToken,
  verifySessionCookie,
} from "@/lib/auth/session";

const bodySchema = z.object({
  idToken: z.string().min(1).max(4096),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
  }

  try {
    const { value, user } = await createSessionCookieValue(parsed.data.idToken);
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
    });

    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: "No se pudo crear la sesión" },
      { status: 401 },
    );
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  forgetCachedSessions();
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;

  try {
    if (bearer) {
      return NextResponse.json({ user: await verifyIdToken(bearer) });
    }
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(SESSION_COOKIE)?.value;
    if (!cookieValue) {
      return NextResponse.json({ user: null }, { status: 401 });
    }
    return NextResponse.json({ user: await verifySessionCookie(cookieValue) });
  } catch {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
