import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  AuthSessionError,
  SESSION_COOKIE,
  verifyIdToken,
} from "@/lib/auth/session";

export async function POST(request: Request) {
  const body = (await request.json()) as { idToken?: string };
  if (!body.idToken) {
    return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
  }

  try {
    const session = await verifyIdToken(body.idToken);
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, body.idToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 5,
    });

    return NextResponse.json({ user: session });
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
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const header = request.headers.get("authorization");
  const cookieStore = await cookies();
  const token =
    (header?.startsWith("Bearer ") ? header.slice(7) : null) ??
    cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  try {
    const session = await verifyIdToken(token);
    return NextResponse.json({ user: session });
  } catch {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
