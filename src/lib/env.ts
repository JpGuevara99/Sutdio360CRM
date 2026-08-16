/**
 * Lee una variable de entorno sin comillas ni espacios de más.
 * En Vercel a veces se pega el valor como `"studio360-crm"` y el popup
 * de Google termina en un dominio que no existe.
 */
export function readEnv(name: string): string | undefined {
  let value = process.env[name]?.trim();
  if (!value) return undefined;
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"));
  if (quoted && value.length >= 2) {
    value = value.slice(1, -1).trim();
  }
  return value || undefined;
}

export function getAllowedEmailDomains(): string[] {
  const raw = readEnv("ALLOWED_EMAIL_DOMAINS") ?? "";
  return raw
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

/**
 * Sin dominios configurados no se permite el acceso. Es intencional: una
 * variable olvidada en producción dejaría entrar a cualquier cuenta Google.
 */
export function isEmailAllowed(email: string): boolean {
  const domains = getAllowedEmailDomains();
  if (domains.length === 0) return false;
  const domain = email.split("@")[1]?.toLowerCase();
  return Boolean(domain && domains.includes(domain));
}

/**
 * Correos con rol ADMIN (acciones irreversibles y configuración global).
 * Se toma ADMIN_EMAILS y, además, la cuenta de Workspace que usa la app, que
 * es la dueña del Drive y del calendario.
 */
export function getAdminEmails(): string[] {
  const emails = (readEnv("ADMIN_EMAILS") ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const owner = readEnv("GOOGLE_WORKSPACE_IMPERSONATE_EMAIL")?.toLowerCase();
  if (owner && !emails.includes(owner)) emails.push(owner);

  return emails;
}

export function getAppUrl(): string {
  return readEnv("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
}
