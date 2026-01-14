# Flujo y I/O del Worker `wf-procesar-factura`

Fecha: 2026-01-14 15:00:17

Resumen: este documento describe qué hace `archivos_archivo/wf-procesar-factura/wf-procesar-factura.js` (el bundle exportado desde Cloudflare), las rutas/entradas/salidas que le afectan, bindings requeridos y el flujo de ejecución paso a paso.

---

ID | Elemento | Descripción detallada
--- | --- | ---
1 | Archivo (bundle) | `archivos_archivo/wf-procesar-factura/wf-procesar-factura.js` — JS compilado exportado desde Cloudflare que contiene: la clase del workflow `ProcesarFacturaWorkflow` y el `fetch` handler por defecto.
2 | Handler HTTP | `fetch` expuesto por el Worker. Acepta únicamente POSTs; valida JSON del cuerpo y campos obligatorios: `invoiceId`, `r2Key`, `originalFileName`, `contentType`, `fileUrl`.
3 | Respuesta inicial | Si la entrada es válida, el handler crea una instancia de workflow mediante `env.WF_PROCESAR_FACTURA.create({ id: crypto.randomUUID(), params: payload })` y devuelve JSON: `{ workflow: "wf-procesar-factura", instancia_id: <id> }`.
4 | Workflow entrypoint | `ProcesarFacturaWorkflow` (named handler `ProcesarFacturaWorkflow`) que implementa `run(event, step)`. Su lógica principal lanza un sub-step `wf-facturas-extraer-texto` usando `step.do`.
5 | Sub-step `wf-facturas-extraer-texto` | Dentro del step se realiza: lectura de secretos y plantillas, llamada a OpenAI y escritura de resultados/errores en R2.
6 | Bindings requeridos (entrada) | - `NSKV_SECRETOS` (KV) — clave `OPENAI_API_KEY` se lee aquí.
 |  | - `NSKV_PROMPTS` (KV) — clave `facturas-extraer-texto` (plantilla JSON) se lee aquí.
 |  | - `WF_PROCESAR_FACTURA` (workflow binding) — usado por el handler para crear instancias.
7 | Bindings requeridos (salida) | - `R2_FACTURAS` (R2 bucket) — se escribe el resultado o errores: `facturas/${invoiceId}/facturas-extraer-texto.json` y `facturas/${invoiceId}/facturas-extraer-texto-ERROR_<timestamp>.json`.
8 | Servicio externo | OpenAI: POST a `https://api.openai.com/v1/responses` con Authorization `Bearer <OPENAI_API_KEY>` y body generado a partir de la plantilla procesada.
9 | Manejo de errores | - Si la llamada a OpenAI responde con status !ok, se guarda un `documentoError` en R2 con `apioResponse: {}` y `error` con código y detalles truncados (500 chars). También crea una copia con sufijo `-ERROR_<timestamp>.json` con detalles adicionales.
 |  | - Si ocurre un error de procesamiento (ej. plantillas inválidas), se captura y se guarda `documentoError` similar en R2; si guardar falla, se registra otro error en consola.
10 | Logs y observabilidad | Usa `console.log` y `console.error` en varios puntos (inicio de step, respuesta de OpenAI, escritura en R2, errores). Observability en metadata indica `invocation_logs` habilitado.
11 | Rutas / despliegue | Metadata exportada indica `routes: null` — el Worker no tiene rutas públicas configuradas en la metadata exportada; para que sea accesible por HTTP es necesario configurar rutas o deploy con un subdomain/workers route en `wrangler.toml` o desde la UI/API de Cloudflare.
12 | Compatibilidad y handlers | Metadata: `compatibility_date: 2025-09-27`; handler principal `fetch`; named handler `ProcesarFacturaWorkflow` con handlers `__workflow_entrypoint` y `run`.
13 | Archivos relacionados en repo | - Código fuente de desarrollo (nuevo): `workers/wf-procesar-factura/src/*` (handler, workflow, helpers) — implementaciones equivalentes al bundle.
 |  | - Artefacto de referencia: `archivos_archivo/wf-procesar-factura/wf-procesar-factura.js` y `wf-procesar-factura.metadata.json`.
14 | Flujo de ejecución (paso a paso) | 1) Llega POST al Worker → 2) `fetch` valida JSON y campos → 3) crea `WF_PROCESAR_FACTURA` instance → 4) Workflow `ProcesarFacturaWorkflow.run` ejecuta `step.do('wf-facturas-extraer-texto', async ()=>{...})` → 5) dentro del step: lee `OPENAI_API_KEY` y plantilla desde KV → 6) reemplaza `{{ARCHIVO_URL}}` en plantilla y parsea como JSON → 7) hace POST a OpenAI `/v1/responses` → 8) Si OK: escribe `documentoExito` en R2 (`facturas/...-extraer-texto.json`) y retorna éxito; si error: guarda `documentoError` y copia `-ERROR_<timestamp>.json` → 9) `run` retorna resultado; logs se registran en el proceso.
15 | Entradas externas que pueden afectar su comportamiento | - Contenido de `NSKV_PROMPTS` (plantilla) — si inválido JSON, falla el parseo.
 |  | - Existencia y valor de `OPENAI_API_KEY` en `NSKV_SECRETOS`.
 |  | - Disponibilidad de OpenAI y respuesta de la API (status, body).
 |  | - Permisos de escritura en `R2_FACTURAS`.
16 | Impacto de rutas y despliegue | - Si no hay rutas configuradas, el Worker no recibirá tráfico HTTP; para producción, configurar rutas en Cloudflare o usar `workers.dev` subdomain. Recomendación: añadir una ruta específica o usar un subdominio/trigger controlado.
17 | Consideraciones de seguridad | - Nunca loguear claves ni respuestas completas de APIs en producción (truncar/redactar). - Rotar `OPENAI_API_KEY` si se expone. - Limitar permisos del API token usado para publicar el Worker.

---

Notas finales:
- El bundle es la representación ejecutable; para un flujo de desarrollo mantenible conviene mantener **fuente TypeScript** en `workers/wf-procesar-factura/src/` (ya creado) y usar CI para `build` y `wrangler publish` al hacer merge en `main`.
- Si quieres, puedo añadir un diagrama simple SVG/ASCII o un checklist de pre-despliegue (ej.: validar KV entries, probar con Miniflare, revisar permisos de token) en este documento.
