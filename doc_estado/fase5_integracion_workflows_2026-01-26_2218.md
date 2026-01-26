# Fase 5 – Integración con Cloudflare Workflows (solo interfaz de invocación)

## Alcance
- Definir cómo el Worker (manejadores `fetch` y `email`) invoca el Workflow sin modificar la lógica interna del Workflow.
- Garantizar que el evento unificado se entrega de forma consistente desde ambos orígenes.

## Interfaz de invocación desde el Worker
- Binding: `WF_PROCESAR_FACTURA`, declarado en wrangler y disponible en `env` (ver [workers/wf-procesar-factura/wrangler.toml](workers/wf-procesar-factura/wrangler.toml#L9-L15)).
- Método de interacción: `create({ id: <uuid>, params: <evento_unificado> })` usado en el manejador `fetch` actual (ver [workers/wf-procesar-factura/src/index.ts](workers/wf-procesar-factura/src/index.ts#L22-L29)).
- Clase objetivo: `ProcesarFacturaWorkflow` definida en [workers/wf-procesar-factura/src/workflow.ts](workers/wf-procesar-factura/src/workflow.ts#L1-L30) (sin cambios en esta fase).

## Evento unificado hacia el Workflow
- Campos requeridos (idénticos para HTTP y correo): `invoiceId`, `r2Key`, `originalFileName`, `contentType`, `fileUrl`.
- Metadatos opcionales (solo trazabilidad, no disruptivos): remitente, asunto, identificador de mensaje, huella del adjunto u otros campos de correo.
- Ambos manejadores deben construir exactamente el mismo objeto de parámetros para el Workflow; los metadatos opcionales no deben cambiar nombres ni tipos de los campos requeridos.

## Consistencia y no regresión
- No alterar la forma ni la semántica del evento actual que consume el Workflow.
- No introducir validaciones adicionales en el flujo HTTP que puedan rechazar peticiones que hoy aceptan.
- Cualquier metadato adicional debe ser ignorado de forma segura por el Workflow si no es consumido.

## Referencias oficiales
- Workflows – Trigger desde Workers: https://developers.cloudflare.com/workflows/build/trigger-workflows/
- Workflows – Workers API: https://developers.cloudflare.com/workflows/build/workers-api/
- Workflows – Events and parameters: https://developers.cloudflare.com/workflows/build/events-and-parameters/
- Workers – Handlers (fetch/email): https://developers.cloudflare.com/workers/runtime-apis/handlers/
- Workers – Bindings (Workflows, R2, KV, D1): https://developers.cloudflare.com/workers/runtime-apis/bindings/
