# MVP y hoja de ruta

## Criterios de aceptación del MVP (sección 22)

Leyenda: ✅ implementado y probado aquí · 🟡 implementado, pendiente de prueba con credenciales reales · ⬜ no implementado

| # | Criterio | Estado | Cómo se comprobó / qué falta |
|---|---|---|---|
| 1 | Autenticarse con proveedor real | 🟡 | Flujo OAuth PKCE con Supabase (Google y Azure) implementado; requiere proyecto Supabase y apps OAuth. |
| 2 | Configurar perfil | 🟡 | Onboarding de 3 pasos y página de perfil; esquema `ProfileInput` probado. |
| 3 | Escribir qué desea aprender | 🟡 | `learning_goals` persistido antes de llamar a la IA. |
| 4 | Reto generado por llamada real a la IA | 🟡 | Adaptadores Claude/Gemini compilados contra los SDK oficiales; `npm run test:live` lo prueba con 5 ingenierías. Sin clave en este entorno. |
| 5 | Aceptar el reto | 🟡 | |
| 6 | Módulos y entregables coherentes | 🟡 | Validador semántico probado (3–8 módulos, dependencias, rúbricas, conceptos). |
| 7 | Guardar y recuperar tras cerrar sesión | ✅/🟡 | Todo persiste en Postgres; RLS probado en Postgres 16 real. |
| 8 | Abrir un módulo | 🟡 | Workspace de 3 paneles. |
| 9 | Identificar al menos un conocimiento requerido | ✅/🟡 | El validador exige ≥1 concepto por módulo. |
| 10 | Recursos de proveedores reales | 🟡 | 5 adaptadores con pruebas de normalización; la red de este entorno bloquea las APIs. |
| 11 | Fuentes verificables | ✅ | URL canónica, autores, fecha, tipo, licencia, procedencia; el LLM solo puede elegir candidatos recuperados (probado). |
| 12 | Explicación contextual de IA | 🟡 | |
| 13 | Resolver una práctica | 🟡 | Intento escrito por el servidor; `mastered` exige aprobación (trigger probado). |
| 14 | Enviar una evidencia | 🟡 | Texto, URL, archivo; inspección real de repos GitHub y archivos de texto. |
| 15 | Evaluación estructurada | ✅/🟡 | Reglas de decisión probadas; llamada al modelo pendiente de credenciales. |
| 16 | Avanzar al siguiente módulo | ✅ | Desbloqueo por dependencias (unitario) + trigger de completitud (SQL). |
| 17 | Terminar un proyecto | ✅/🟡 | Trigger exige todos los módulos completos (SQL probado). |
| 18 | Página de portafolio | 🟡 | Edición, privado por defecto, enlace público, README.md (probado), PDF vía impresión. |

### Pruebas ejecutadas

- `npm run typecheck`, `npm run lint`, `npm run build`: sin errores.
- `npm test`: 60 pruebas (validadores con fixtures de varias ingenierías, adaptadores, ranking, reglas de progreso, README, costos, prompt injection, orquestación de IA con proveedor simulado, compatibilidad de esquemas con ambos SDK).
- `npm run test:db`: migraciones aplicadas en Postgres 16 + pgvector; aislamiento entre usuarios, escrituras prohibidas, triggers de integridad, portafolio público y borrado en cascada.
- `npm run test:e2e` (sin credenciales): landing, protección de rutas, estado de configuración pendiente, API del tutor protegida, cabeceras de seguridad, modo oscuro.
- **No ejecutado aquí**: llamadas reales a Claude/Gemini, YouTube, OpenAlex, Crossref, arXiv y GitHub, y el flujo E2E autenticado completo (requieren credenciales/red).

## Limitaciones conocidas

- Operaciones largas (generar ruta, evaluar) son síncronas con `maxDuration = 300`; no hay cola de trabajos ni progreso en vivo.
- Sin transcripciones de video: los minutos solo aparecen si el autor publicó capítulos.
- No se ejecuta código del estudiante; la evaluación de código es estática.
- PDFs, imágenes, videos y archivos CAD se almacenan pero no se inspeccionan.
- La "comprobación rápida" para omitir conceptos fundamentales reutiliza la práctica de la tarjeta.
- El límite por usuario cuenta solicitudes, no tokens.
- Ajuste de ruta (cambiar enfoque conservando historial) está modelado (`challenge_versions`, `route_adjusted`) pero sin UI.
- Política de privacidad operativa, no revisada legalmente.

## Fase 2

Cola de trabajos y streaming de progreso · RAG con indexación de contenido abierto permitido (pgvector + HNSW, búsqueda híbrida BM25+vector) y reranker · Semantic Scholar, Europe PMC/PubMed, OpenStax, DOAB, MIT OCW, Stack Exchange · transcripciones solo vía mecanismos autorizados · ejecución de pruebas en sandbox aislado (p. ej. contenedores efímeros con límites) · inspección de PDF con el proveedor de IA · UI de ajuste de ruta · analítica de competencias · evaluación semiautomatizada avanzada · límites por tokens/costo · observabilidad (OpenTelemetry/Sentry).

## Fase 3

Multilingüe completo · multiuniversidad y paneles institucionales · retos de profesores y empresas (con `origin = published_by_organization` verificado) · equipos colaborativos · integración LMS (LTI 1.3) · analítica institucional y longitudinal · licencias institucionales.

## Siguientes prioridades

1. Configurar Supabase + OAuth + clave de IA y ejecutar `npm run test:live` y el flujo completo con el caso de Ciencia de Datos (demanda eléctrica) y uno de Mecatrónica.
2. Ajustar prompts con esas salidas reales (versionar).
3. Cola de trabajos para planificación y evaluación.
4. Sandbox de ejecución para evidencias de código.
