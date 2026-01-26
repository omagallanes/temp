# Fase 6 – Checklist de verificación previo al despliegue

# Alcance
- Esta checklist se aplicará una vez completadas las fases de implementación; en el estado actual es preparatoria y no implica que los elementos existan ya en el entorno.

## 1. Configuración de Email Routing
- Email Routing habilitado en la zona objetivo (referencia: https://developers.cloudflare.com/email-routing/get-started/enable-email-routing/).
- Registros MX aplicados según indicaciones de Cloudflare y verificada su propagación; sin impactos en rutas existentes.
- Email Workers habilitado en la zona (referencia: https://developers.cloudflare.com/email-routing/email-workers/enable-email-workers/).
- Reglas de enrutamiento configuradas que dirigen las direcciones/alias previstos al Worker `wf-procesar-factura`; sin colisiones con otras reglas.
- Direcciones de destino verificadas cuando aplique el flujo de reenvío.

## 2. Worker (HTTP y correo)
- Bundle contiene ambos manejadores: `fetch` (sin cambios de contrato) y `email` (nuevo flujo de correo).
- Validaciones mínimas comunes activas y equivalentes entre HTTP y correo; sin endurecer el flujo HTTP existente.
- Normalización al contrato unificado (`invoiceId`, `r2Key`, `originalFileName`, `contentType`, `fileUrl`).
- Respuestas claras de aceptación/rechazo para ambos orígenes; trazas con `invoiceId` y `r2Key`.
- `fileUrl` utilizable por el Workflow; no se asume que sea público.

## 3. Bindings y recursos
- Workers KV configurados y accesibles: `NSKV_SECRETOS`, `NSKV_PROMPTS` (si se usan en correo).
- R2 `R2_FACTURAS` accesible para lectura/escritura desde ambos manejadores.
- D1 `DB_FAT_EMPRESAS` accesible para la ruta de prueba y cualquier dependencia actual.
- Binding de Workflow `WF_PROCESAR_FACTURA` disponible y referenciado a `ProcesarFacturaWorkflow`.
- Variables de entorno adicionales (si hay listas de remitentes, etc.) declaradas y documentadas; sin afectar la compatibilidad HTTP.

## 4. Autenticación por token para despliegue con Wrangler
- Token de API creado con permisos mínimos necesarios para desplegar el Worker y gestionar Email Routing (referencia: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/).
- Variables de entorno de sistema (p.ej., `CLOUDFLARE_API_TOKEN`) disponibles para el despliegue con wrangler (referencia: https://developers.cloudflare.com/workers/wrangler/system-environment-variables/).
- Revisión de alcances para evitar privilegios excesivos.

## 5. Trazabilidad y calidad
- Logs previstos: inclusión de `invoiceId`, `r2Key`, nombre/tipo del adjunto seleccionado; en errores, causa y decisión de selección.
- Mensajes de error coherentes y diferenciados para validaciones comunes y específicas de correo.
- Criterios de aceptación/rechazo documentados y aplicados de forma uniforme en ambos manejadores.

## Referencias
- Email Routing: https://developers.cloudflare.com/email-routing/get-started/enable-email-routing/
- Email Workers: https://developers.cloudflare.com/email-routing/email-workers/enable-email-workers/
- Email Workers runtime API: https://developers.cloudflare.com/email-routing/email-workers/runtime-api/
- Workers – Handlers: https://developers.cloudflare.com/workers/runtime-apis/handlers/
- Workers – Bindings: https://developers.cloudflare.com/workers/runtime-apis/bindings/
- Workflows – Trigger desde Workers: https://developers.cloudflare.com/workflows/build/trigger-workflows/
- Workflows – Events and parameters: https://developers.cloudflare.com/workflows/build/events-and-parameters/
- API token creation: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- Wrangler system environment variables: https://developers.cloudflare.com/workers/wrangler/system-environment-variables/
