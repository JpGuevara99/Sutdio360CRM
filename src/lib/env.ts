export function getAllowedEmailDomains(): string[] {
  const raw = process.env.ALLOWED_EMAIL_DOMAINS ?? "";
  return raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
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
  const emails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const owner = process.env.GOOGLE_WORKSPACE_IMPERSONATE_EMAIL?.trim().toLowerCase();
  if (owner && !emails.includes(owner)) emails.push(owner);

  return emails;
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
