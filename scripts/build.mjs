/**
 * Vercel inyecta NEXT_ADAPTER_PATH; con standalone rompe el build (ENOENT nft.json).
 * Este script quita el adaptador y usa el `next` local del proyecto.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

delete process.env.NEXT_ADAPTER_PATH;
delete process.env.NEXT_ENABLE_ADAPTER;

const pkg = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8"),
);
console.log(`[build] next version: ${pkg.dependencies?.next ?? "unknown"}`);

const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");

const result = spawnSync(process.execPath, [nextCli, "build", "--webpack"], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
