import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  verifyIdToken,
  type SessionUser,
} from "@/lib/auth/session";

export async function requirePageSession(): Promise<SessionUser> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    redirect("/login");
  }

  try {
    return await verifyIdToken(token);
  } catch {
    redirect("/login");
  }
}
