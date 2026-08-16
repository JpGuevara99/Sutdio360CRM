import {
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { readEnv } from "@/lib/env";

function getPrivateKey(): string | undefined {
  return readEnv("FIREBASE_PRIVATE_KEY")?.replace(/\\n/g, "\n");
}

/** Fuerza repo local (.data/store.json) aunque Admin esté configurado. */
export function forceLocalDb(): boolean {
  const flag = readEnv("CRM_USE_LOCAL_DB")?.toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

export function isFirebaseAdminConfigured(): boolean {
  if (forceLocalDb()) return false;
  return Boolean(
    readEnv("FIREBASE_PROJECT_ID") &&
      readEnv("FIREBASE_CLIENT_EMAIL") &&
      readEnv("FIREBASE_PRIVATE_KEY"),
  );
}

let app: App | undefined;

function getAdminApp(): App {
  if (!isFirebaseAdminConfigured()) {
    throw new Error("Firebase Admin env vars are not configured");
  }
  if (!app) {
    app =
      getApps()[0] ??
      initializeApp({
        credential: cert({
          projectId: readEnv("FIREBASE_PROJECT_ID"),
          clientEmail: readEnv("FIREBASE_CLIENT_EMAIL"),
          privateKey: getPrivateKey(),
        }),
      });
  }
  return app;
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}
