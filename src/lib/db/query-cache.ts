/**
 * Caché en memoria para lecturas de colecciones completas de Firestore.
 *
 * El plan Spark cuenta una lectura por documento devuelto. Guardamos la promesa
 * para que llamadas simultáneas y lecturas repetidas en este proceso compartan
 * una consulta; las escrituras invalidan las claves de los datos modificados.
 *
 * TTL configurable con CRM_DB_CACHE_TTL_MS (0 desactiva la caché).
 */

const DEFAULT_TTL_MS = 180_000;

type Entry = { expiresAt: number; promise: Promise<unknown> };

const entries = new Map<string, Entry>();

function ttlMs(): number {
  const raw = process.env.CRM_DB_CACHE_TTL_MS;
  if (raw === undefined) return DEFAULT_TTL_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_TTL_MS;
}

export function cachedRead<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const ttl = ttlMs();
  if (ttl === 0) return loader();

  const now = Date.now();
  const hit = entries.get(key);
  if (hit && hit.expiresAt > now) return hit.promise as Promise<T>;

  const promise = loader().catch((error) => {
    entries.delete(key);
    throw error;
  });
  entries.set(key, { expiresAt: now + ttl, promise });
  return promise;
}

/** Vacía la caché (una clave concreta o todas). */
export function invalidateQueryCache(...keys: string[]): void {
  if (keys.length === 0) {
    entries.clear();
    return;
  }
  for (const key of keys) entries.delete(key);
}
