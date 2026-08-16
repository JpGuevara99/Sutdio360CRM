import { isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import * as firestoreRepo from "@/lib/db/firestore-repo";
import * as memoryRepo from "@/lib/db/memory-repo";
import { invalidateQueryCache } from "@/lib/db/query-cache";

type Repo = typeof firestoreRepo;

function getRepo(): Repo {
  return (isFirebaseAdminConfigured() ? firestoreRepo : memoryRepo) as Repo;
}

const READ_PREFIXES = ["list", "get", "count", "find", "search", "is", "has"];

function isReadOperation(name: string): boolean {
  return READ_PREFIXES.some(
    (prefix) =>
      name.startsWith(prefix) &&
      name.length > prefix.length &&
      name[prefix.length] === name[prefix.length].toUpperCase(),
  );
}

export const db: Repo = new Proxy({} as Repo, {
  get(_target, prop, receiver) {
    const repo = getRepo();
    const value = Reflect.get(repo, prop, receiver);
    if (typeof value !== "function") return value;

    const bound = value.bind(repo);
    if (typeof prop !== "string" || isReadOperation(prop)) return bound;

    // Toda operación de escritura invalida la caché de lecturas para que la
    // siguiente pantalla no muestre datos viejos.
    return (...args: unknown[]) => {
      const result = bound(...args);
      if (result instanceof Promise) {
        return result.finally(() => invalidateQueryCache());
      }
      invalidateQueryCache();
      return result;
    };
  },
});

export function usingFirestore(): boolean {
  return isFirebaseAdminConfigured();
}
