import { renameProjectDriveFoldersToShortCodes } from "@/lib/crm/drive-sync";

async function main() {
  const summary = await renameProjectDriveFoldersToShortCodes();

  console.log(
    `Renombradas: ${summary.renamed} · Sin cambio: ${summary.unchanged} · Sin carpeta: ${summary.skipped} · Fallidas: ${summary.failed}`,
  );

  for (const row of summary.results) {
    if (row.status === "renamed") {
      console.log(`✓ ${row.publicCode}: "${row.from}" → "${row.to}"`);
    } else if (row.status === "failed") {
      console.log(`✗ ${row.publicCode}: ${row.error}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
