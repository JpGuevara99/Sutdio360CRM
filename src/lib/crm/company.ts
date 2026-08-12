import type { CompanySettings } from "@/lib/crm/types";
import { formatChileAddress } from "@/lib/crm/chile-address";

export const COMPANY_NAME = "360 STUDIO";
export const COMPANY_EMAIL = "contacto@studio360.cl";
export const QUOTE_VALIDITY_DAYS = 10;
export const QUOTE_PAYMENT_METHODS = "Transferencia / Débito";

export function formatCompanyFooter(
  settings?: Pick<CompanySettings, "commercialAddress" | "phone"> | null,
): string {
  const address = formatChileAddress(settings?.commercialAddress) || null;
  const phone = (settings?.phone ?? "").trim() || null;
  return [COMPANY_NAME, address, phone, COMPANY_EMAIL]
    .filter(Boolean)
    .join(" | ");
}
