import type { NextConfig } from "next";

// En Vercel no uses `output: "standalone"` (bug Next 16.3 + adapter → ENOENT nft.json).
// Para Docker/Cloud Run: descomenta la línea `output` o define OUTPUT_STANDALONE=1.
const useStandalone =
  !process.env.VERCEL && process.env.OUTPUT_STANDALONE === "1";

const nextConfig: NextConfig = {
  ...(useStandalone ? { output: "standalone" as const } : {}),
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
