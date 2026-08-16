import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { stripQuotes } from "@/lib/env";

function firebaseAuthDomain(): string | undefined {
  // Acceso estático: Next solo inyecta NEXT_PUBLIC_* en el navegador así.
  const projectId = stripQuotes(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  if (projectId) return `${projectId}.firebaseapp.com`;
  const configured = stripQuotes(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
  if (
    configured?.endsWith(".firebaseapp.com") ||
    configured?.endsWith(".web.app")
  ) {
    return configured;
  }
  return undefined;
}

function getFirebaseConfig() {
  return {
    apiKey: stripQuotes(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    authDomain: firebaseAuthDomain(),
    projectId: stripQuotes(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    appId: stripQuotes(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  };
}

export function isFirebaseConfigured(): boolean {
  const config = getFirebaseConfig();
  return Boolean(
    config.apiKey && config.authDomain && config.projectId && config.appId,
  );
}

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase client env vars are not configured");
  }
  if (!app) {
    app = getApps()[0] ?? initializeApp(getFirebaseConfig());
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
  }
  return auth;
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
