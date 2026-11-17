# Reta — aprendizaje por retos profesionales de ingeniería con IA

> "No enseñamos mediante cursos convencionales. Enseñamos construyendo proyectos profesionales reales, mientras la IA identifica qué debe aprender el estudiante, cuándo debe aprenderlo y cuál es el recurso más preciso para conseguirlo."

Plataforma universitaria (inicio: Tecnológico de Monterrey) donde un estudiante escribe qué quiere aprender o construir y recibe un **reto profesional**, una **ruta modular con entregables**, **tarjetas de conocimiento just-in-time** respaldadas por fuentes reales, un **tutor que guía sin resolver**, **evaluación por evidencias con rúbricas** y un **portafolio profesional**.

## Estado

Fase 1 (MVP) implementada. Ver [MVP_ROADMAP.md](MVP_ROADMAP.md) para qué está verificado, qué falta comprobar con credenciales reales y las siguientes fases.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript estricto · Tailwind CSS 4 (componentes estilo shadcn/ui) · Lucide · Supabase (Auth Google/Microsoft, Postgres + RLS, pgvector, Storage) · Claude o Gemini vía adaptador propio · Zod · Vitest.

## Inicio rápido

```bash
npm install
cp .env.example .env.local      # completa las credenciales (SETUP.md)
# aplica supabase/migrations/*.sql en tu proyecto Supabase
npm run dev
```

Sin credenciales la app arranca y muestra `/setup` con el estado "configuración pendiente" de cada integración. Nada se simula.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` / `build` / `start` | Desarrollo / compilación / producción |
| `npm run typecheck` · `npm run lint` | TypeScript estricto · ESLint |
| `npm test` | Pruebas unitarias e integración sin red (Vitest) |
| `npm run test:db` | Aplica migraciones en Postgres local y prueba RLS e integridad (`PGURL=...`) |
| `npm run test:e2e` | E2E de humo con Playwright contra `npm start` |
| `npm run test:live` | Pruebas en vivo contra OpenAlex, Crossref, arXiv, GitHub, YouTube y el proveedor de IA (usa `.env.local`) |

## Documentación

- [ARCHITECTURE.md](ARCHITECTURE.md) — arquitectura, carpetas, flujos y decisiones
- [DATABASE.md](DATABASE.md) — modelo de datos, RLS e integridad
- [AI_SYSTEM.md](AI_SYSTEM.md) — agentes, prompts versionados, validación, costos y seguridad
- [INTEGRATIONS.md](INTEGRATIONS.md) — proveedores de recursos, cuotas, licencias y límites
- [SETUP.md](SETUP.md) — cómo obtener y configurar cada credencial
- [MVP_ROADMAP.md](MVP_ROADMAP.md) — criterios de aceptación, verificación, pendientes y fases

## Principios

Las competencias y evaluaciones generadas con IA **no son certificaciones** ni acreditaciones universitarias. La plataforma nunca inventa referencias, timestamps ni resultados: si algo no se pudo verificar, lo dice.
