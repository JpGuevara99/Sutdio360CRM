/**
 * Reglas de seguridad para archivos subidos al CRM y servidos de vuelta.
 *
 * El riesgo concreto: un archivo HTML o SVG servido desde nuestro propio
 * dominio ejecuta su JavaScript con la sesión del usuario que lo abre. Por eso
 * solo se muestran incrustados los tipos que el navegador no ejecuta, y el
 * resto se descarga.
 */

/** 25 MB: suficiente para planos y fotos, evita subidas abusivas. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Extensiones bloqueadas: ejecutables o capaces de correr scripts. */
const BLOCKED_EXTENSIONS = [
  "html",
  "htm",
  "xhtml",
  "svg",
  "mhtml",
  "js",
  "mjs",
  "jsx",
  "ts",
  "exe",
  "msi",
  "bat",
  "cmd",
  "com",
  "scr",
  "ps1",
  "sh",
  "jar",
  "vbs",
  "wsf",
  "hta",
  "dll",
  "apk",
  "app",
];

/** Tipos que el navegador puede mostrar sin ejecutar código. */
const INLINE_SAFE_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "text/plain",
];

function extensionOf(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

export function isBlockedUpload(fileName: string, mimeType: string): boolean {
  const type = mimeType.toLowerCase();
  return (
    BLOCKED_EXTENSIONS.includes(extensionOf(fileName)) ||
    type === "image/svg+xml" ||
    type.startsWith("text/html") ||
    type.includes("xhtml")
  );
}

/** true si el archivo puede mostrarse en el navegador sin riesgo. */
export function canRenderInline(mimeType: string): boolean {
  return INLINE_SAFE_MIME.includes(mimeType.toLowerCase().split(";")[0].trim());
}

/**
 * Nombre seguro para la cabecera Content-Disposition: sin saltos de línea,
 * comillas ni rutas que permitan salirse del valor de la cabecera.
 */
export function safeHeaderFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "archivo";
  const cleaned = base.replace(/[\r\n"]/g, "").trim();
  return cleaned.slice(0, 120) || "archivo";
}
