import { TopBar } from "@/components/crm/TopBar";
import { PageBody } from "@/components/crm/PageBody";
import {
  ProjectsPipeline,
  type BoardProject,
} from "@/components/crm/ProjectsPipeline";
import { clientFullName } from "@/lib/crm/labels";
import { db } from "@/lib/db";

export default async function ProjectsPage() {
  const [stages, projects] = await Promise.all([
    db.listPipelineStages(),
    db.listProjects(),
  ]);

  const boardProjects: BoardProject[] = projects.map((project) => {
    const visit = project.visits[0];
    return {
      id: project.id,
      publicCode: project.publicCode,
      stageId: project.stageId,
      boardOrder: project.boardOrder,
      status: project.status,
      clientName: clientFullName(project.client),
      address: project.client.address,
      visitAt: visit ? visit.scheduledAt.toISOString() : null,
      bookedAt: visit ? visit.bookedAt.toISOString() : null,
      source: visit?.source ?? null,
    };
  });

  return (
    <>
      <TopBar title="Proyectos" />
      <PageBody fill>
        <ProjectsPipeline
          initialStages={stages.map((s) => ({
            id: s.id,
            name: s.name,
            order: s.order,
          }))}
          initialProjects={boardProjects}
        />
      </PageBody>
    </>
  );
}
