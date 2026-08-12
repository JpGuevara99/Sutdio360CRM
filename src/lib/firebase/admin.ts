import {
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function getPrivateKey(): string | undefined {
  const key = process.env.FIREBASE_PRIVATE_KEY;
  return key?.replace(/\\n/g, "\n");
}

/** Fuerza repo local (.data/store.json) aunque Admin esté configurado. */
export function forceLocalDb(): boolean {
  const flag = process.env.CRM_USE_LOCAL_DB?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

export function isFirebaseAdminConfigured(): boolean {
  if (forceLocalDb()) return false;
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
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
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
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
