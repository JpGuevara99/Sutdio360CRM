import type { NextConfig } from "next";

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
};

export default nextConfig;
