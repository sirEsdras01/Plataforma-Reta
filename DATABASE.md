# Modelo de datos

Migraciones en `supabase/migrations/` (aplicar en orden). Probadas en Postgres 16 + pgvector con un stub de `auth`/`storage` (`npm run test:db`).

## Entidades

| Dominio | Tablas | Notas |
|---|---|---|
| Identidad | `auth.users` (Supabase), `user_profiles` | Perfil creado por trigger al registrarse. |
| Taxonomía extensible | `institutions`, `academic_programs`, `disciplines` (árbol), `skills`, `skill_prerequisites` | Semillas mínimas; `origin = 'ai_proposed'` para disciplinas nuevas propuestas por la IA. No hay lista cerrada de carreras. |
| Competencias | `user_skills` | `source`: declared · demonstrated (respaldada por `evidence_evaluation_id`) · ai_inferred. Ninguna es certificación. |
| Objetivos y retos | `learning_goals`, `challenges`, `challenge_versions` | Las propuestas se versionan; `origin` distingue *ai_generated* de *industry_inspired* y reserva *published_by_organization* para Fase 3. |
| Proyecto y ruta | `student_projects`, `challenge_modules`, `module_dependencies`, `module_tasks` | Estados del módulo: pending · preparing · in_progress · in_review · completed · needs_changes. `last_module_id` para "continuar donde me quedé". |
| Conocimiento | `knowledge_concepts` (global), `module_concepts` (privado) | `module_concepts.knowledge_card` guarda la tarjeta validada. Estado: pending · studying · practicing · mastered · skipped_known. |
| Recursos | `resource_providers`, `external_resources`, `resource_segments`, `concept_resources` | Recursos globales con `provenance` y `last_verified_at`. Segmentos con `verification` (author_chapters · official_toc · transcript · unverified). |
| Práctica | `practice_exercises`, `practice_attempts` | |
| Evidencias | `submissions`, `submission_files`, `evaluation_rubrics`, `evaluations` | `evidence_status`: received · analyzed · verified · pending_review. `inspection_notes` declara qué se inspeccionó realmente. |
| Portafolio | `portfolio_items` | `visibility` private (defecto) / public; `generated_content` conserva la versión original de la IA. |
| Tutor | `tutor_conversations`, `tutor_messages` | |
| Telemetría | `learning_progress` (eventos), `ai_usage_logs` (tokens, costo, latencia, versión de prompt) | |
| Caché | `provider_cache` | Solo service role. |

`users` del listado original = `auth.users`; `student_projects` es la instancia aceptada de un reto.

## Seguridad (RLS)

- Todas las tablas tienen RLS activado.
- Tablas privadas: políticas `user_id = auth.uid()` para select/insert/update/delete. `user_id` está desnormalizado en tablas hijas para que las políticas no requieran joins.
- Catálogos globales: lectura para `authenticated`; escritura solo service role.
- `evaluations`, `practice_attempts`, `submissions` (insert/update): sin políticas de escritura para el cliente; las escribe el servidor.
- `ai_usage_logs`: el estudiante solo lee lo suyo.
- `portfolio_items`: además, lectura para `anon` cuando `visibility = 'public'`.
- Storage: bucket privado `evidence`, carpeta por usuario (`{user_id}/...`).

## Integridad (triggers)

- `guard_module_completion`: un módulo solo pasa a `completed` si existe una evaluación `accepted` de una evidencia del módulo.
- `guard_project_completion`: un proyecto solo pasa a `completed` si todos sus módulos lo están.
- `guard_concept_mastery`: un concepto solo pasa a `mastered` con un intento de práctica aprobado.

## Supresión de datos

Borrar el usuario de `auth.users` elimina en cascada todos sus datos privados (probado). La acción de Configuración también borra sus archivos del bucket `evidence`.

## Índices

Índices por `user_id` + fecha en tablas de alto volumen, trigram (`pg_trgm`) en nombres de skills, conceptos y títulos de recursos, y columnas `vector(768)` preparadas para búsqueda semántica (Fase 2; índice HNSW cuando haya volumen).
