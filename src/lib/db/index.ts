import { isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import * as firestoreRepo from "@/lib/db/firestore-repo";
import * as memoryRepo from "@/lib/db/memory-repo";
import { invalidateQueryCache } from "@/lib/db/query-cache";

type Repo = typeof firestoreRepo;

function getRepo(): Repo {
  return (isFirebaseAdminConfigured() ? firestoreRepo : memoryRepo) as Repo;
}

const READ_PREFIXES = ["list", "get", "count", "find", "search", "is", "has"];

const CACHE_KEYS_BY_WRITE: Record<string, readonly string[]> = {
  createProjectExpense: ["collection:projectExpenses"],
  updateProjectExpense: ["collection:projectExpenses"],
  deleteProjectExpense: ["collection:projectExpenses"],
  createClientRecord: ["collection:clients"],
  upsertClient: ["collection:clients"],
  updateClient: ["collection:clients"],
  promoteTemporaryLeadCode: ["collection:clients"],
  setClientLeadCode: ["collection:clients"],
  deleteClient: ["collection:clients", "collection:clientMatchReviews"],
  setClientTrashed: ["collection:clients"],
  createClientMatchReview: ["collection:clientMatchReviews"],
  updateClientMatchReview: ["collection:clientMatchReviews"],
  createProject: ["collection:projects"],
  updateProject: ["collection:projects"],
  setProjectTrashed: ["collection:projects"],
  setProjectPublicCode: ["collection:projects"],
  reorderProjectsInStage: ["collection:projects"],
  createVisit: ["collection:visits"],
  updateVisit: ["collection:visits"],
  updateVisitNotes: ["collection:visits"],
  hardDeleteProject: [
    "collection:projects",
    "collection:quotes",
    "collection:quoteLines",
    "collection:projectExpenses",
    "collection:visits",
  ],
  hardDeleteClient: [
    "collection:clients",
    "collection:clientMatchReviews",
  ],
  createPipelineStage: ["collection:pipelineStages"],
  updatePipelineStage: ["collection:pipelineStages", "collection:projects"],
  deletePipelineStage: ["collection:pipelineStages", "collection:projects"],
  reorderPipelineStages: ["collection:pipelineStages"],
  createMaterialCategory: ["collection:materialCategories"],
  updateMaterialCategory: ["collection:materialCategories"],
  deleteMaterialCategory: [
    "collection:materialCategories",
    "collection:materials",
  ],
  createMaterial: ["collection:materials"],
  createMaterials: ["collection:materials"],
  updateMaterial: ["collection:materials"],
  deleteMaterial: ["collection:materials"],
  deleteAllMaterials: ["collection:materials"],
  createQuote: ["collection:quotes", "quotes:projects:*"],
  setQuoteCosts: ["collection:quotes", "quotes:projects:*"],
  updateQuote: ["collection:quotes", "quotes:projects:*"],
  deleteQuote: [
    "collection:quotes",
    "collection:quoteLines",
    "quotes:projects:*",
  ],
  addQuoteLines: [
    "collection:quotes",
    "collection:quoteLines",
    "quotes:projects:*",
  ],
  updateQuoteLine: [
    "collection:quotes",
    "collection:quoteLines",
    "quotes:projects:*",
  ],
  deleteQuoteLine: [
    "collection:quotes",
    "collection:quoteLines",
    "quotes:projects:*",
  ],
  cloneQuoteToProject: [
    "collection:quotes",
    "collection:quoteLines",
    "quotes:projects:*",
  ],
  // These writes affect only documents that are not cached here.
  upsertStaffUser: [],
  nextPublicCode: [],
  nextLeadCode: [],
  setCodeSequences: [],
  createProjectNote: [],
  updateProjectNote: [],
  deleteProjectNote: [],
  createAuditLog: [],
  createFileRef: [],
  updateCompanySettings: [],
  updateFollowUpSettings: [],
  setCalendarSyncToken: [],
};

function isReadOperation(name: string): boolean {
  return READ_PREFIXES.some(
    (prefix) =>
      name.startsWith(prefix) &&
      name.length > prefix.length &&
      name[prefix.length] === name[prefix.length].toUpperCase(),
  );
}

function invalidateForWrite(name: string): void {
  const keys = CACHE_KEYS_BY_WRITE[name];
  if (keys === undefined) {
    // Unknown writes retain the conservative behavior until their effects are mapped.
    invalidateQueryCache();
  } else if (keys.length > 0) {
    invalidateQueryCache(...keys);
  }
}

export const db: Repo = new Proxy({} as Repo, {
  get(_target, prop, receiver) {
    const repo = getRepo();
    const value = Reflect.get(repo, prop, receiver);
    if (typeof value !== "function") return value;

    const bound = value.bind(repo);
    if (typeof prop !== "string" || isReadOperation(prop)) return bound;

    // Las escrituras invalidan solo las colecciones que pueden haber cambiado.
    return (...args: unknown[]) => {
      const result = bound(...args);
      if (result instanceof Promise) {
        return result.finally(() => invalidateForWrite(prop));
      }
      invalidateForWrite(prop);
      return result;
    };
  },
});

export function usingFirestore(): boolean {
  return isFirebaseAdminConfigured();
}
