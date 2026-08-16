import { NextResponse, type NextRequest } from "next/server";

/**
 * Límite de peticiones por IP para la API.
 *
 * No pretende detener un ataque distribuido: sirve para que un script suelto
 * (o un bug en un cliente) no dispare miles de llamadas, que en este proyecto
 * significan cuota de Firestore quemada y, en el login, intentos en cadena.
 *
 * El conteo vive en memoria del proceso, así que cada instancia lleva el suyo.
 */
const WINDOW_MS = 60_000;
const GENERAL_LIMIT = 600;
const AUTH_LIMIT = 20;
const MAX_TRACKED_IPS = 5_000;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function pruneExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "desconocida";
}

function exceedsLimit(key: string, limit: number): number | null {
  const now = Date.now();
  if (buckets.size > MAX_TRACKED_IPS) pruneExpired(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return Math.ceil((bucket.resetAt - now) / 1000);
  }
  return null;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuth = pathname.startsWith("/api/auth/");
  const limit = isAuth ? AUTH_LIMIT : GENERAL_LIMIT;
  const retryAfter = exceedsLimit(
    `${isAuth ? "auth" : "api"}:${clientIp(request)}`,
    limit,
  );

  if (retryAfter != null) {
    return NextResponse.json(
      { error: "Demasiadas peticiones. Intenta de nuevo en un momento." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
