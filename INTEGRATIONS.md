# Integraciones de recursos

Todos los proveedores implementan `ResourceProvider` (`src/server/integrations/types.ts`): búsqueda uniforme, metadatos normalizados (`NormalizedResource`), procedencia (`provenance`), licencia cuando existe, y errores tipados (`ProviderError`: quota · auth · http · parse · timeout · network). El orquestador (`recommendation/search.ts`) ejecuta las consultas en paralelo, aísla fallos por proveedor, usa caché en `provider_cache` y reporta el estado de cada consulta en la tarjeta de conocimiento.

| Proveedor | Estado en MVP | Credencial | Endpoints | Notas |
|---|---|---|---|---|
| YouTube Data API v3 | Implementado | `YOUTUBE_API_KEY` (requerida) | `search.list` (100 unidades) + `videos.list` (1 unidad) | Solo videos embebibles, safeSearch estricto, idioma preferido. **No se descargan transcripciones** (`captions.download` exige OAuth del dueño del video). Los fragmentos temporales solo provienen de capítulos que el autor publicó en la descripción, validados con las reglas de capítulos de YouTube (inicia en 0:00, ≥3 marcas ascendentes, ≥10 s). Caché de 72 h para cuidar la cuota diaria (10 000 unidades por defecto). Reproductor `youtube-nocookie.com`. |
| OpenAlex | Implementado | `OPENALEX_API_KEY` opcional (`api_key`, amplía la cuota) | `/works?search=` | DOI como URL canónica; abstract reconstruido del índice invertido; `oa_url` para texto completo legal. No afirma revisión por pares en artículos (no expuesta explícitamente); los preprints se marcan "sin revisión por pares". |
| Crossref | Implementado | Ninguna (`CONTACT_EMAIL` opcional → `mailto`) | `/works?query=` | Abstract JATS limpiado; licencia si existe. |
| arXiv | Implementado | Ninguna | `/api/query` (Atom) | Siempre preprint (sin revisión por pares). Respeta la recomendación de baja frecuencia gracias a la caché. |
| GitHub | Implementado | `GITHUB_TOKEN` opcional | `/search/repositories`, `/repos/{o}/{r}`, `/readme`, `/git/trees` | Orden por relevancia (no por estrellas). Excluye archivados. También se usa para **inspeccionar evidencias** (README + árbol de archivos de repos públicos). |
| Semantic Scholar, Europe PMC, PubMed, CORE, OpenStax, DOAB, MIT OCW, Stack Exchange | Fase 2 | — | — | Interfaz lista: añadir un archivo en `providers/` y registrarlo en `registry.ts`. Verificar términos y límites antes de activar. |

## Validación de URLs

- Solo se muestran URLs `https` sin credenciales embebidas (`safePublicUrl`).
- El servidor solo hace peticiones a hosts de proveedores conocidos; los enlaces que entrega el estudiante (salvo GitHub) **no se descargan** (prevención de SSRF) y quedan como "recibidos, no inspeccionados".

## Derechos de autor

Se guardan metadatos y abstracts públicos devueltos por las APIs; nunca capítulos o transcripciones completas. Las explicaciones son síntesis propias del modelo. Los videos se muestran con el reproductor oficial embebido.

## Límites verificados en este entorno de construcción

El contenedor donde se construyó el MVP bloquea la red hacia OpenAlex, Crossref, arXiv y GitHub, por lo que los adaptadores se probaron con respuestas simuladas que siguen el formato documentado (`tests/integrations.test.ts`). Las pruebas en vivo (`npm run test:live`) deben ejecutarse en un entorno con red.
