/**
 * Quita comillas envolventes. En Vercel a veces se pega el valor como
 * `"studio360-crm"` y el popup de Google termina en un dominio que no existe.
 */
export function stripQuotes(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let trimmed = value.trim();
  const quoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
  if (quoted && trimmed.length >= 2) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed || undefined;
}

/** Lee una variable de entorno sin comillas ni espacios de más. */
export function readEnv(name: string): string | undefined {
  return stripQuotes(process.env[name]);
}

/**
 * Arregla claves PEM pegadas en Vercel/.env: comillas extra, `\n` literal,
 * JSON completo de cuenta de servicio, o saltos de línea de Windows.
 */
export function normalizePemPrivateKey(
  raw: string | undefined,
): string | undefined {
  if (!raw) return undefined;
  let key = raw.trim().replace(/^\uFEFF/, "");

  for (let i = 0; i < 4; i += 1) {
    const unquoted = stripQuotes(key);
    if (!unquoted || unquoted === key) break;
    key = unquoted;
  }

  if (key.startsWith("{")) {
    try {
      const parsed = JSON.parse(key) as { private_key?: unknown };
      if (typeof parsed.private_key === "string") {
        key = parsed.private_key.trim();
      }
    } catch {
      // Seguir con el texto original
    }
  }

  for (let i = 0; i < 3; i += 1) {
    const next = key.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\n");
    if (next === key) break;
    key = next;
  }
  key = key.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

  const begin = key.match(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
  const end = key.match(/-----END [A-Z ]*PRIVATE KEY-----/);
  if (begin && end) {
    const startIdx = key.indexOf(begin[0]);
    const endIdx = key.lastIndexOf(end[0]) + end[0].length;
    key = key.slice(startIdx, endIdx);
  }

  const lines = key
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length > 0) {
    key = lines.join("\n");
  }

  if (!key.endsWith("\n")) key += "\n";
  return key;
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
