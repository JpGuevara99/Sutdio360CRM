import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel + Next 16.3: `standalone` rompe el build (ENOENT next-server.js.nft.json).
  // En Docker/Cloud Run/Firebase App Hosting sí conviene standalone.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  serverExternalPackages: ["firebase-admin", "googleapis"],
  // Permite abrir el CRM en tablet/móvil por IP local en desarrollo
  allowedDevOrigins: [
    "192.168.1.101",
    "192.168.1.100",
    "192.168.0.100",
    "192.168.0.101",
  ],
};

export default nextConfig;
