# Fase 2 – Contrato de entrada unificado (Worker wf-procesar-factura)

## Alcance y premisas
- Mantener intacto el contrato HTTP existente: mismos campos requeridos, mismas respuestas y sin endurecer validaciones actuales.
- El Workflow no se modifica; el Worker solo normaliza entradas (HTTP y correo) hacia el mismo contrato lógico.
- `invoiceId` se genera preferentemente como UUID en el Worker; los encabezados de correo solo aportan metadatos secundarios.
- `fileUrl` es una referencia utilizable por el Workflow; no se asume que sea pública ni presignada.

## Contrato base actual (HTTP)
- Campos requeridos: `invoiceId`, `r2Key`, `originalFileName`, `contentType`, `fileUrl` (ver [workers/wf-procesar-factura/src/index.ts](workers/wf-procesar-factura/src/index.ts#L11-L33)).
- Validación actual: solo presencia/truthy de los cinco campos; sin checks de formato, MIME ni URL; sin autenticación. Este contrato debe permanecer sin cambios para no afectar al Front End existente.

## Contrato lógico unificado (HTTP y correo)
- Requeridos (idénticos al HTTP actual):
  - `invoiceId` (UUID generado en el Worker para ambos orígenes).
  - `r2Key` (clave en R2 donde se guarda el archivo fuente).
  - `originalFileName` (nombre original del archivo recibido).
  - `contentType` (MIME declarado del archivo fuente).
  - `fileUrl` (referencia accesible por el Workflow al archivo almacenado).
- Opcionales (no disruptivos para el Workflow): metadatos de correo (remitente, asunto, identificador de mensaje, huella del adjunto), preservados solo para trazabilidad.

## Mapeo desde EmailEvent al contrato
- `invoiceId`: generar UUID en el manejador `email` para mantener simetría con HTTP; cualquier identificador de correo (Message-ID u otros) se conserva como metadato opcional.
- `originalFileName` y `contentType`: tomar del adjunto seleccionado como principal.
- `r2Key`: calcular tras subir el adjunto a R2 siguiendo la convención ya usada en el flujo HTTP.
- `fileUrl`: referencia que el Workflow pueda consumir; puede ser interna/no pública si así se configure la carga en R2.
- Metadatos de correo: incluir como campos opcionales sin alterar la forma ni los tipos de los campos requeridos.

## Validaciones comunes (mínimo común, sin endurecer HTTP)
- Presencia de los cinco campos requeridos tras la normalización.
- Coherencia básica entre `contentType` y el archivo almacenado cuando sea trivial validarlo (sin introducir rechazos nuevos en HTTP).
- Respuestas de error claras ante ausencia de campos; sin cambiar códigos ni mensajes actuales en el flujo HTTP.

## Validaciones específicas de correo
- Presencia de al menos un adjunto; si no hay adjunto, rechazar la entrada de correo.
- Criterio de adjunto principal: seleccionar el primer adjunto cuyo `contentType` esté en la lista permitida; priorizar `application/pdf` cuando esté presente. Si hay varios adjuntos válidos, usar el primero conforme a este criterio y registrar la selección.
- Tipos MIME aceptados: mantener alineados con lo que ya funciona hoy (por ejemplo, PDF como formato principal de entrada). No añadir restricciones nuevas ni ampliar a formatos no usados sin aprobación explícita.
- Tamaño: cumplir las restricciones de Cloudflare Email Workers; no fijar umbrales adicionales en este plan.
- En caso de adjuntos múltiples, documentar en trazas qué adjunto se usó y cuáles se descartaron para facilitar auditoría.

## Trazabilidad y equivalencia funcional
- Ambos manejadores (`fetch` y `email`) deben producir exactamente el mismo objeto requerido por el Workflow. Los metadatos de correo viajan solo como opcionales para auditoría.
- No se cambian nombres ni tipos de los cinco campos requeridos; no se introducen validaciones más estrictas en el camino HTTP.

## Referencias oficiales
- Workers – Handlers (`fetch` y otros): https://developers.cloudflare.com/workers/runtime-apis/handlers/
- Email Workers y EmailEvent (runtime API): https://developers.cloudflare.com/email-routing/email-workers/runtime-api/
- Email Workers (visión general): https://developers.cloudflare.com/email-routing/email-workers/
- Workflows – Trigger desde Workers: https://developers.cloudflare.com/workflows/build/trigger-workflows/
- Workflows – Events and parameters: https://developers.cloudflare.com/workflows/build/events-and-parameters/
- Workers – Bindings y recursos (KV, R2, D1): https://developers.cloudflare.com/workers/runtime-apis/bindings/
