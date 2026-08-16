import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/** Dominio de Firebase Auth (popup de Google) para permitirlo en la CSP. */
const firebaseAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  ? `https://${process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}`
  : "https://*.firebaseapp.com";

/**
 * Content-Security-Policy: limita de dónde puede cargar el navegador. Si algún
 * día se cuela un script malicioso, esto impide que se ejecute o que envíe
 * datos a un servidor ajeno.
 *
 * Next inyecta scripts en línea para hidratar la página, por eso script-src
 * necesita 'unsafe-inline'. Lo estricto está en el resto: nada de plugins
 * (object-src), nadie puede incrustar la app (frame-ancestors) y las conexiones
 * solo van a nuestro servidor y a Google.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://apis.google.com https://www.gstatic.com https://accounts.google.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com https://*.google.com",
  "font-src 'self' data:",
  `connect-src 'self' blob: https://*.googleapis.com https://accounts.google.com ${firebaseAuthDomain}${isDev ? " ws: wss:" : ""}`,
  `frame-src 'self' blob: https://accounts.google.com https://apis.google.com ${firebaseAuthDomain}`,
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Evita que el navegador "adivine" el tipo de un archivo y lo ejecute.
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]),
];

/**
 * Nunca usar `output: "standalone"` en Vercel (bug Next 16.3 + adapter).
 * Docker/Cloud Run: `OUTPUT_STANDALONE=1` en el build (ver Dockerfile).
 */
const nextConfig: NextConfig = {
  ...(process.env.OUTPUT_STANDALONE === "1"
    ? { output: "standalone" as const }
    : {}),
  serverExternalPackages: ["firebase-admin", "googleapis"],
  allowedDevOrigins: [
    "192.168.1.101",
    "192.168.1.100",
    "192.168.0.100",
    "192.168.0.101",
  ],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
