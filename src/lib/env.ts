export function getAllowedEmailDomains(): string[] {
  const raw = process.env.ALLOWED_EMAIL_DOMAINS ?? "";
  return raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email: string): boolean {
  const domains = getAllowedEmailDomains();
  if (domains.length === 0) return true;
  const domain = email.split("@")[1]?.toLowerCase();
  return Boolean(domain && domains.includes(domain));
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
