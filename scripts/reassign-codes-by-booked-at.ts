import { reassignCodesByBookedAt } from "@/lib/crm/reassign-codes";

async function main() {
  const result = await reassignCodesByBookedAt();

  console.log(
    `Proyectos cambiados: ${result.projects.length} · Clientes cambiados: ${result.clients.length} · Carpetas renombradas: ${result.foldersRenamed}`,
  );

  for (const row of result.projects) {
    console.log(`P: ${row.from} → ${row.to}`);
  }
  for (const row of result.clients) {
    console.log(`C: ${row.from} → ${row.to}`);
  }
  for (const err of result.folderErrors) {
    console.log(`✗ ${err}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
