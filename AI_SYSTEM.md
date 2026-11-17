# Sistema de IA

## Proveedores y modelos

Interfaz única `LLMProvider` (`src/server/ai/types.ts`) con `generateObject` (salida estructurada validada) y `streamText`. Implementaciones:

| Proveedor | SDK | Modelo por defecto | Salida estructurada |
|---|---|---|---|
| Anthropic | `@anthropic-ai/sdk` | `claude-opus-5-5` (`ANTHROPIC_MODEL`) | `messages.parse` + `output_config.format` desde Zod; `output_config.effort`; fallback del servidor ante rechazos (`ANTHROPIC_SERVER_FALLBACKS`) |
| Google | `@google/genai` | `gemini-3.8-flash` (`GEMINI_MODEL`) | `responseMimeType: application/json` + `responseJsonSchema` (`z.toJSONSchema`) + validación Zod |
| Embeddings | `@google/genai` | `gemini-embedding-001`, 768 dims | Preparado para Fase 2 |

Los IDs se verificaron el 2026-11-17 en la documentación oficial y son configurables. Con `claude-opus-5-5` el razonamiento adaptativo está siempre activo y su esfuerzo por defecto es `medium`; el código fija el esfuerzo explícitamente por operación.

## Agentes (módulos, no servicios)

| Agente | Función | Esfuerzo | Validación semántica |
|---|---|---|---|
| Intent Analyzer + Challenge Designer | `designChallenges` | medium | 1–3 propuestas; 3 si es muy general; ≤2 aclaraciones; rangos de duración; URLs https |
| Curriculum Planner + Knowledge Gap Analyzer | `planCurriculum` | medium | 3–8 módulos; conceptos por módulo; rúbricas sin IDs duplicados; dependencias hacia atrás |
| Academic Research Agent | `planResearch` | low | 1–8 consultas por proveedor |
| Resource Ranking Engine | `rankCandidates` (código) + `composeKnowledgeCard` (LLM) | medium | **Solo IDs de candidatos recuperados** |
| Learning Tutor | `/api/tutor` (streaming) + `composeKnowledgeCard` | medium | Niveles de ayuda 1–5 |
| Práctica | `gradePractice` | medium | Feedback estructurado |
| Evidence Evaluator | `evaluateEvidence` | high | Todos los criterios de la rúbrica; la plataforma decide el resultado |
| Portfolio Generator | `generatePortfolio` | medium | Esquema |

## Orquestación (`src/server/ai/client.ts`)

- Límite por usuario: `AI_HOURLY_REQUEST_LIMIT` solicitudes/hora (ventana deslizante sobre `ai_usage_logs`).
- Timeout por llamada (`AI_TIMEOUT_MS`) con `AbortController` y reintentos del SDK (`AI_MAX_RETRIES`) para errores transitorios.
- Un reintento acotado si la salida no pasa el esquema o la validación semántica, devolviendo al modelo el motivo.
- Registro de cada llamada: operación, proveedor, modelo, versión de prompt, tokens, costo estimado, latencia y estado. El costo es `null` si el precio del modelo no está verificado (se puede definir con `AI_PRICING_JSON`).
- Prompts versionados en `src/server/ai/prompts/index.ts`. La versión se guarda en las entidades generadas.
- Caché: las tarjetas de conocimiento y planes se persisten y no se regeneran salvo petición explícita; las búsquedas de proveedores se cachean 2–7 días.

## Decisión de evaluación

El modelo propone puntuaciones por criterio indicando si cada una se apoya en evidencia inspeccionada. La plataforma acepta solo si: el modelo dijo `accepted`, la nota ponderada ≥ umbral de la rúbrica (70 por defecto) y al menos el 50 % del peso se apoya en evidencia inspeccionada. Si no, `needs_changes` o `insufficient_evidence`.

## Seguridad

- Todo contenido externo o escrito por el estudiante se envuelve en `<untrusted source="…">` (se neutralizan intentos de cerrar la etiqueta) y los system prompts prohíben seguir instrucciones dentro de esos bloques.
- El perfil enviado a la IA no incluye correo ni identificadores. El contexto del tutor se construye solo con filas del propio estudiante (RLS).
- Las claves solo existen en el servidor; ninguna variable de IA tiene prefijo `NEXT_PUBLIC_`.
- Anti-fabricación: el recomendador no puede citar recursos que no devolvió un proveedor; los minutos de video solo se muestran si vienen de capítulos publicados por el autor; los datasets sugeridos se etiquetan como "no verificados por la plataforma".
- Markdown generado se renderiza sin HTML crudo; enlaces con `rel="noopener noreferrer nofollow"`.

## Calidad

`npm run test:live` ejecuta el Challenge Designer con objetivos de cinco ingenierías distintas (datos/energía, mecatrónica/visión, CFD, biomédica, civil) y valida cada salida. Requiere `ANTHROPIC_API_KEY` o `GEMINI_API_KEY`.
