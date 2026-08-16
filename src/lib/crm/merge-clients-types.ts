import type { Client, Project } from "@/lib/crm/types";

export type ClientMergePreview = {
  keeper: Client;
  mergeClients: Client[];
  projects: Array<
    Project & {
      fromClientId: string;
      fromClientCode: string;
      fromClientName: string;
    }
  >;
};
