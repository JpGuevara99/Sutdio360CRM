# Studio360 CRM — Paso 1 (Firestore)

CRM interno para **360 Studio** (Santiago, Chile).

- Formulario público: **Google Calendar Appointment Schedule** (el que ya usan)
- Base de datos: **Cloud Firestore** (Firebase)
- Archivos pesados: **Google Drive**
- Login del equipo: **Firebase Auth** (Google Workspace)

Documentación del producto (seguridad, uso del equipo y cómo seguir documentando): carpeta [`docs/`](./docs/).

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

## Google Calendar + Drive + Tasks

Completa en `.env` las variables `GOOGLE_*` (service account con domain-wide delegation). Luego en el Dashboard usa **Sincronizar Calendar**.

Los seguimientos crean tareas en Google Tasks de la cuenta impersonada. Además de Calendar y Drive:

1. En Google Cloud, habilita **Google Tasks API** en el proyecto de la cuenta de servicio.
2. En Admin de Workspace → Seguridad → Controles de API → **Delegación en todo el dominio**, abre el **Client ID numérico** (no el correo) y agrega este scope junto a los de Calendar y Drive:

`https://www.googleapis.com/auth/tasks`

Sin ese scope, Calendar y Drive siguen funcionando, pero Tasks responde `unauthorized_client (401)`.

## Deploy

- **Vercel (producción actual):** al hacer push a `main`, Vercel construye con `vercel.json`.
- `apphosting.yaml` + `firebase.json` → Firebase App Hosting (alternativa)
- `Dockerfile` → Cloud Run

No subas el archivo `.env`. En Vercel → Settings → Environment Variables pega las mismas claves que en `.env.example` (todas las `NEXT_PUBLIC_FIREBASE_*`, `FIREBASE_*`, `GOOGLE_*`, `ALLOWED_EMAIL_DOMAINS`, `ADMIN_EMAILS`, `CRON_SECRET`). En producción deja `CRM_USE_LOCAL_DB=0`.

Después del primer deploy:

1. Copia la URL (`https://….vercel.app` o tu dominio).
2. Ponla en `NEXT_PUBLIC_APP_URL` y vuelve a desplegar.
3. En Firebase Console → Authentication → Settings → **Authorized domains**, agrega ese host. Sin eso, el login de Google falla.

Documentación del producto: [`docs/`](./docs/).

## Nota sobre Google AI Studio

AI Studio es para Gemini, no hospeda esta app ni reemplaza Firestore. El CRM se despliega en Firebase / Cloud Run.
