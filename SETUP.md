# Configuración

Requisitos: Node.js ≥ 20.9 (probado con 22), una cuenta de Supabase y una clave de Anthropic o de Google AI Studio.

## 1. Instalar

```bash
npm install
cp .env.example .env.local
```

## 2. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **Project Settings → API** copia `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`, la clave `anon`/publishable → `NEXT_PUBLIC_SUPABASE_ANON_KEY`, y la `service_role`/secret → `SUPABASE_SERVICE_ROLE_KEY` (solo servidor, nunca en el cliente).
3. Aplica las migraciones, en orden:
   - con la CLI: `supabase link --project-ref <ref>` y `supabase db push`, o
   - pegando cada archivo de `supabase/migrations/` en el **SQL Editor**.
   Las migraciones activan `vector`, `pg_trgm` y `pgcrypto`, crean el bucket privado `evidence` y sus políticas.
4. **Authentication → URL Configuration**: `Site URL` = tu dominio (o `http://localhost:3000`) y añade `http://localhost:3000/auth/callback` y `https://<tu-dominio>/auth/callback` a *Redirect URLs*.

### Google OAuth

1. Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* (Web application).
2. *Authorized redirect URI*: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Supabase → Authentication → Providers → **Google**: pega Client ID y Client Secret y actívalo.

### Microsoft OAuth (Azure / Entra ID)

1. Azure Portal → Microsoft Entra ID → App registrations → *New registration*.
2. Tipo de cuenta: para estudiantes del Tec con cuenta institucional, "Accounts in any organizational directory" (multitenant) o el tenant de la institución; añade "personal Microsoft accounts" si se desea.
3. *Redirect URI* (Web): `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Crea un *client secret* (Certificates & secrets).
5. Supabase → Authentication → Providers → **Azure**: Application (client) ID, secret y, si restringes a un tenant, `Azure Tenant URL` = `https://login.microsoftonline.com/<tenant-id>`.
   La app solicita el scope `email` (requerido por Microsoft para devolver el correo).

## 3. Proveedor de IA

- **Claude**: `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` desde [console.anthropic.com](https://console.anthropic.com) → API Keys. Modelo por defecto `claude-opus-5-5`.
- **Gemini**: `AI_PROVIDER=gemini`, `GEMINI_API_KEY` desde [aistudio.google.com](https://aistudio.google.com) → Get API key. Modelo por defecto `gemini-3.8-flash`. Para registrar costos, define `AI_PRICING_JSON` con los precios vigentes.

Ajusta `AI_HOURLY_REQUEST_LIMIT` (por usuario) y `AI_TIMEOUT_MS` según tu presupuesto.

## 4. Proveedores de recursos

- **YouTube**: Google Cloud Console → habilita *YouTube Data API v3* → crea una API key (restríngela a esa API y, en producción, por IP/servidor) → `YOUTUBE_API_KEY`. Sin clave, YouTube aparece como "configuración pendiente" y se usan los demás proveedores.
- **OpenAlex**: funciona sin clave; `OPENALEX_API_KEY` opcional amplía la cuota diaria.
- **Crossref**: sin clave; `CONTACT_EMAIL` opcional para el polite pool.
- **arXiv**: sin clave.
- **GitHub**: sin token = 10 búsquedas/min; con `GITHUB_TOKEN` (fine-grained, solo lectura de repos públicos) = 30/min y más lecturas para inspeccionar evidencias.

## 5. Ejecutar y verificar

```bash
npm run dev                  # http://localhost:3000 (ve a /setup para ver el estado)
npm run typecheck && npm run lint && npm test
PGURL=postgres://postgres:postgres@localhost:54322 npm run test:db   # p.ej. con `supabase start`
npm run test:live            # pruebas en vivo con tus credenciales (.env.local)
npm run build && npm start & npm run test:e2e   # requiere `npm i -D playwright && npx playwright install chromium`
```

## 6. Despliegue (Vercel)

1. Importa el repositorio en Vercel y define las mismas variables de entorno (incluida `NEXT_PUBLIC_SITE_URL`).
2. Las rutas que llaman a la IA declaran `maxDuration = 300`; verifica que tu plan lo permita.
3. Añade el dominio de producción a las Redirect URLs de Supabase.
