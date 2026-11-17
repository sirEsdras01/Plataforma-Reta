# Arquitectura

## Visión general

Monolito modular en **Next.js 16 (App Router)**. Una sola aplicación desplegable (Vercel u otro host Node) con capas separadas por responsabilidad. Supabase aporta autenticación, Postgres con Row Level Security, pgvector y Storage. No hay microservicios: los "agentes" son módulos de software con contratos tipados.

```
Navegador ──► proxy.ts (refresco de sesión, guardas optimistas)
          ──► Server Components (lectura con RLS)
          ──► Server Actions / Route Handlers (mutaciones, tutor en streaming)
                    │
                    ├── server/services      (casos de uso: retos, aprendizaje, evidencias, portafolio)
                    │      ├── server/ai     (adaptador LLM, agentes, prompts versionados, uso/costos)
                    │      ├── server/recommendation (búsqueda multi-proveedor, dedupe, ranking)
                    │      └── server/integrations   (YouTube, OpenAlex, Crossref, arXiv, GitHub)
                    └── lib/supabase         (cliente con sesión = RLS · cliente service-role acotado)
```

## Estructura de carpetas

```
src/
  app/
    page.tsx, login/, auth/callback, auth/signout, setup/, privacy/, p/[slug] (portafolio público)
    (app)/                      rutas privadas con shell común
      actions.ts                Server Actions (validación Zod + manejo de errores)
      onboarding/ dashboard/ challenges/new/ goals/[goalId]/
      projects/[projectId]/ (ruta) · modules/[moduleId]/ (workspace) · concepts/[mcId]/ (tarjeta)
      resources/ portfolio/ portfolio/[itemId]/ profile/ settings/
    api/tutor/                  tutor con streaming
    api/portfolio/[id]/readme   exportación README.md
  components/                   UI reutilizable (ui/ primitivas, app/ componentes de dominio)
  domain/                       esquemas Zod, reglas puras de progreso y portafolio (sin I/O)
  lib/                          supabase (server/client), utilidades, marca
  server/
    env.ts                      variables de entorno validadas + estado de configuración
    ai/                         types, client (orquestación), providers/ (anthropic, gemini),
                                prompts/ (versionados), agents/ (funciones + validadores), pricing, untrusted
    integrations/               types, http (timeouts/reintentos/URLs), cache, registry, providers/*
    recommendation/             ranking.ts (puro), search.ts (multi-proveedor)
    services/                   session, challenges, learning, evidence, portfolio
  proxy.ts                      (antes "middleware" en Next < 16)
supabase/migrations/            esquema, RLS, triggers de integridad, semillas
supabase/tests/                 stub de Supabase y pruebas SQL de RLS
tests/                          unitarias, fixtures, live/ (en vivo, opt-in)
scripts/                        test-migrations.sh, e2e-smoke.cjs
```

## Flujo principal (caso de aceptación)

1. **Login** con Google o Microsoft (Supabase Auth, PKCE). `auth/callback` intercambia el código por sesión en cookies httpOnly.
2. **Onboarding** progresivo de 3 pasos → `user_profiles` y `user_skills (declared)`.
3. **Objetivo** → `learning_goals`; el *Challenge Designer* devuelve intención + 1–3 propuestas → `challenges` + `challenge_versions`.
4. **Aceptar reto** → `student_projects`; el *Curriculum Planner* genera 3–8 módulos con conceptos, rúbricas y dependencias → `challenge_modules`, `module_tasks`, `module_dependencies`, `knowledge_concepts`, `module_concepts`, `evaluation_rubrics`.
5. **Workspace** de tres paneles: navegación/tareas · objetivo/entregables/evidencias · conceptos/tutor.
6. **Aprender ahora** (just-in-time): plan de búsqueda (LLM) → proveedores reales en paralelo con caché → normalización → deduplicación → ranking heurístico → selección por LLM **restringida a IDs de candidatos** → tarjeta + recursos + práctica.
7. **Práctica** → el servidor califica y escribe el intento (service role); solo un intento aprobado permite `mastered` (trigger).
8. **Evidencia** → inspección real (texto, repos GitHub públicos, archivos de texto) → evaluación con rúbrica → la plataforma decide el resultado (umbral + evidencia inspeccionada) → módulo `completed` (trigger exige evaluación aceptada) y se desbloquea el siguiente.
9. **Fin del proyecto** (trigger exige todos los módulos completos) → *Portfolio Generator* → página editable, privada por defecto, README.md y PDF (impresión).

## Decisiones relevantes

- **Rendering dinámico (cacheComponents desactivado).** Casi todas las pantallas son por usuario; la base de datos es la fuente de verdad. Simplifica el uso de cookies de Supabase. Reevaluar en Fase 2 para la landing y páginas públicas.
- **Dos clientes de Supabase.** El cliente con sesión pasa por RLS para todo lo del estudiante. El cliente *service role* solo se usa en el servidor para: catálogos globales, caché de proveedores, registro de uso de IA, y escrituras que determinan progreso (intentos de práctica, evidencias, evaluaciones, competencias demostradas), siempre después de comprobar propiedad con el cliente del usuario.
- **Integridad en la base de datos**, no solo en la UI: triggers impiden completar módulos/proyectos o dominar conceptos sin la evidencia requerida.
- **Flujo determinista en lugar de multi-agente.** Cada agente es una llamada estructurada con esquema Zod y validación semántica; el orquestador es código. Más barato, auditable y testeable.
- **Operaciones largas síncronas en el MVP** (generar ruta: 1–2 min) con estado persistido (`planning`/`failed` + reintento) y `maxDuration = 300`. Fase 2: cola de trabajos (Supabase Queues / Inngest) y progreso en tiempo real.
- **Sin ejecución de código del estudiante** en el servidor. La inspección es estática; la ejecución en sandbox aislado es Fase 2.
- **Sin descarga de URLs arbitrarias** (evita SSRF): solo hosts de proveedores conocidos.
