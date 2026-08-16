import { TopBar } from "@/components/crm/TopBar";
import { PageBody } from "@/components/crm/PageBody";
import { MaterialsManager } from "@/components/crm/MaterialsManager";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { db } from "@/lib/db";

export default async function MaterialsPage() {
  await requirePageSession();

  const [materials, categories] = await Promise.all([
    db.listMaterials(),
    db.listMaterialCategories(),
  ]);

  return (
    <>
      <TopBar title="Lista de Materiales" />
      <PageBody fill>
        <MaterialsManager
          initialCategories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            order: c.order,
          }))}
          initialMaterials={materials.map((m) => ({
            id: m.id,
            name: m.name,
            categoryId: m.categoryId,
            unit: m.unit,
            costPrice: m.costPrice,
          }))}
        />
      </PageBody>
    </>
  );
}
