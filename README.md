# Studio360 CRM — Paso 1 (Firestore)

CRM interno para **360 Studio** (Santiago, Chile).

- Formulario público: **Google Calendar Appointment Schedule** (el que ya usan)
- Base de datos: **Cloud Firestore** (Firebase)
- Archivos pesados: **Google Drive**
- Login del equipo: **Firebase Auth** (Google Workspace)

## Arranque rápido (sin configurar Firebase aún)

Puedes probar la interfaz en tu PC sin nube. Los datos se guardan en `.data/store.json` (modo local).

```bash
npm install
npm run dev
```

Abre [http://localhost:3000/login](http://localhost:3000/login) → **Entrar en modo desarrollo**.

Prueba: **Nueva visita** → debería crearse un proyecto `P-000001`.

## Usar Firestore de verdad (recomendado)

1. Entra a [Firebase Console](https://console.firebase.google.com) y crea un proyecto (o usa el de la empresa).
2. Activa **Authentication** → Sign-in method → **Google**.
3. Activa **Firestore Database** → crea en modo producción (o prueba) en una región cercana (ej. `southamerica-east1`).
4. Project settings → General → registra una app Web y copia las keys `NEXT_PUBLIC_FIREBASE_*`.
5. Project settings → Service accounts → **Generate new private key**.
6. En `.env` pega:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...@....iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
ALLOWED_EMAIL_DOMAINS=tudominio.cl
```

7. Reinicia `npm run dev`. El dashboard debe mostrar base de datos **Firestore**.

### Colecciones que crea el CRM

- `clients`
- `projects`
- `visits`
- `staffUsers`
- `fileRefs`
- `meta/projectCodeSequence`
- `meta/calendarSync`

## Google Calendar + Drive

Completa en `.env` las variables `GOOGLE_*` (service account con domain-wide delegation). Luego en el Dashboard usa **Sincronizar Calendar**.

## Deploy

- `apphosting.yaml` + `firebase.json` → Firebase App Hosting
- `Dockerfile` → Cloud Run

Configura los secretos de entorno en el hosting. No subas el archivo `.env`.

## Nota sobre Google AI Studio

AI Studio es para Gemini, no hospeda esta app ni reemplaza Firestore. El CRM se despliega en Firebase / Cloud Run.
