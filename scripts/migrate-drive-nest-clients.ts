import { nestProjectDriveFoldersUnderClients } from "@/lib/crm/drive-sync";

async function main() {
  const summary = await nestProjectDriveFoldersUnderClients();

  console.log(
    `Clientes: ${summary.clientsTouched} · Movidas: ${summary.moved} · Renombradas: ${summary.renamed} · Sin cambio: ${summary.unchanged} · Omitidas: ${summary.skipped} · Fallidas: ${summary.failed}`,
  );

  for (const row of summary.results) {
    const code = row.publicCode
      ? `${row.clientCode}/${row.publicCode}`
      : row.clientCode;
    if (row.status === "failed") {
      console.log(`✗ ${code}: ${row.error}`);
    } else if (row.status !== "unchanged" && row.status !== "skipped") {
      console.log(`✓ ${code} [${row.status}] ${row.detail ?? ""}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
