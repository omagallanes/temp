# Fase 3 – Diseño del manejo de correo en el Worker (sin implementación)

## Principios
- Convivencia de manejadores: el Worker expondrá `fetch` (sin cambios) y `email` en el mismo script. El contrato HTTP permanece intacto.
- Objetivo: que ambos orígenes (HTTP y correo) produzcan el mismo contrato unificado ya definido en Fase 2 y deleguen al mismo Workflow.
- Sin cambios en la lógica del Workflow ni en su interfaz.

## Responsabilidades por manejador
- `fetch`: mantener rutas actuales (`POST /` para eventos, `GET /prueba-sheetjs` de prueba). No se endurecen validaciones ni se altera la semántica existente.
- `email`: recibir `EmailEvent` (Cloudflare Email Workers) y normalizarlo al contrato unificado antes de invocar el Workflow mediante el mismo binding.

## Flujo lógico del manejador `email`
1. Recepción del `EmailEvent` (metadatos + adjuntos) según API de Email Workers (referencia: https://developers.cloudflare.com/email-routing/email-workers/runtime-api/).
2. Selección del adjunto principal:
   - Criterio: primer adjunto cuyo `contentType` esté en la lista permitida (alineada con el flujo actual; priorizar `application/pdf` si existe).
   - Registrar en trazas cuál adjunto se usa y, si aplica, cuáles se descartan.
3. Validaciones específicas de correo (mínimas):
   - Existe adjunto válido según el criterio anterior; si no, rechazar.
   - Tipo MIME en lista permitida; no ampliar ni restringir frente a lo que ya funciona en HTTP sin aprobación explícita.
   - Tamaño: respetar límites de Email Workers; no añadir umbrales nuevos en este diseño.
4. Preparación de artefacto:
   - Subir el adjunto seleccionado a `R2_FACTURAS` generando `r2Key` conforme a la convención actual.
   - Construir `fileUrl` utilizable por el Workflow (no asumir que sea público; puede ser referencia interna válida para el Workflow).
5. Construcción del evento unificado:
   - `invoiceId`: UUID generado en el manejador `email`.
   - `r2Key`, `originalFileName`, `contentType`, `fileUrl`: derivados del adjunto seleccionado y su carga en R2.
   - Metadatos de correo (remitente, asunto, identificador de mensaje, huella) como campos opcionales no disruptivos.
6. Delegación:
   - Invocar el Workflow con el binding `WF_PROCESAR_FACTURA` usando el mismo método (`create`) y pasando el evento unificado como `params`.
7. Respuesta y trazabilidad:
   - Aceptación: indicar éxito y el identificador generado; registrar `invoiceId` y `r2Key` en logs.
   - Rechazo: mensaje claro de causa (sin datos sensibles); registrar contexto y causa.

## Criterios de aceptación/rechazo y trazas
- Aceptar solo si se construye el contrato completo (cinco campos requeridos) y se sube el adjunto válido a R2.
- Rechazar si falta adjunto válido, si el MIME no está permitido, o si no se puede almacenar el archivo.
- Logs mínimos: `invoiceId`, `r2Key`, tipo y nombre del adjunto usado; en errores, causa y decisión de adjunto.
- Prevención de duplicados: definir y documentar el criterio (p.ej., huella del adjunto o identificador de mensaje) solo como metadato; su implementación se reserva para una fase posterior. No alterar el `invoiceId` generado para compatibilidad.

## Convivencia y equivalencia con HTTP
- Ambos manejadores generan el mismo contrato unificado y usan la misma invocación al Workflow.
- No se modifican los códigos ni los mensajes del flujo HTTP.
- Metadatos de correo no deben interferir con la lógica existente del Workflow.

## Referencias oficiales
- Handlers en Workers (`fetch`, `email`): https://developers.cloudflare.com/workers/runtime-apis/handlers/
- Email Workers y EmailEvent: https://developers.cloudflare.com/email-routing/email-workers/
- Email Workers runtime API: https://developers.cloudflare.com/email-routing/email-workers/runtime-api/
- Workflows – Trigger desde Workers: https://developers.cloudflare.com/workflows/build/trigger-workflows/
- Workflows – Events and parameters: https://developers.cloudflare.com/workflows/build/events-and-parameters/
- Workers – Bindings (R2, KV, D1, Workflows): https://developers.cloudflare.com/workers/runtime-apis/bindings/
