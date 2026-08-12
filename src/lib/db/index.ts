import { isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import * as firestoreRepo from "@/lib/db/firestore-repo";
import * as memoryRepo from "@/lib/db/memory-repo";

type Repo = typeof firestoreRepo;

function getRepo(): Repo {
  return (isFirebaseAdminConfigured() ? firestoreRepo : memoryRepo) as Repo;
}

export const db: Repo = new Proxy({} as Repo, {
  get(_target, prop, receiver) {
    const repo = getRepo();
    const value = Reflect.get(repo, prop, receiver);
    return typeof value === "function" ? value.bind(repo) : value;
  },
});

export function usingFirestore(): boolean {
  return isFirebaseAdminConfigured();
}
