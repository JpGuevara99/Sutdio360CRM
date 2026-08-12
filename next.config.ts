import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
