# Fase 2 – Contrato de entrada unificado y equivalencia funcional

## Premisas
- Mantener intacto el contrato HTTP actual: mismos campos requeridos, mismas respuestas, sin endurecer validaciones ni cambiar semántica del `fetch` ya en producción.
- El Workflow no cambia; el Worker solo normaliza entradas (HTTP y correo) al mismo contrato lógico.
- `invoiceId` se genera preferentemente como UUID en el Worker; los encabezados de correo son metadatos secundarios.
- `fileUrl` es una referencia utilizable por el Workflow; no se asume que sea pública o presignada.

## Contrato base actual (HTTP)
- Campos requeridos en POST: `invoiceId`, `r2Key`, `originalFileName`, `contentType`, `fileUrl` (ver [workers/wf-procesar-factura/src/index.ts](workers/wf-procesar-factura/src/index.ts#L11-L33)).
- Validación actual: solo presencia/truthy de estos cinco campos; sin checks de formato/MIME/URL ni autenticación. Esta laxitud se mantiene para no romper el Front End.
 - Validación actual: solo presencia/truthy de estos cinco campos; sin checks de formato/MIME/URL ni autenticación. Esta laxitud se mantiene para no romper el Front End. Cualquier endurecimiento futuro requerirá una fase separada con revisión de impacto sobre el Front End en Pages.

## Contrato lógico unificado (HTTP y correo)
- Requeridos (idénticos al HTTP actual): `invoiceId`, `r2Key`, `originalFileName`, `contentType`, `fileUrl`.
- Opcionales (no disruptivos): metadatos de correo como remitente, asunto, identificador de mensaje, huella del adjunto u otros; el Workflow puede ignorarlos sin impacto.

## Mapeo desde EmailEvent al contrato
- `invoiceId`: UUID generado en el manejador `email` para simetría con HTTP; el Message-ID u otros headers se conservan solo como metadatos.
 - `invoiceId`: UUID generado en el manejador `email` para simetría con HTTP; el Message-ID u otros headers se conservan solo como metadatos. `invoiceId` no se usará para transportar identificadores externos del correo.
- `originalFileName` y `contentType`: tomados del adjunto principal seleccionado.
- `r2Key`: generado al subir el adjunto a `R2_FACTURAS` siguiendo la convención usada en el flujo HTTP.
- `fileUrl`: referencia que el Workflow pueda consumir; puede ser interna/no pública según configuración de R2.
- Metadatos de correo: incluir como campos opcionales sin alterar nombres ni tipos de los campos requeridos.

## Validaciones comunes (mínimo común)
- Presencia de los cinco campos requeridos tras normalizar.
- Coherencia básica entre `contentType` y el archivo almacenado cuando sea trivial validarlo, sin introducir rechazos nuevos en HTTP.
- Mensajes de error claros ante ausencia de campos, conservando códigos y textos actuales en HTTP.

## Validaciones específicas de correo
- Presencia de al menos un adjunto válido; si no hay, rechazar la entrada de correo.
- Criterio de adjunto principal: primer adjunto cuyo `contentType` esté permitido, priorizando `application/pdf` si está presente.
- Tipos MIME aceptados: mantener alineados con lo que ya funciona hoy (PDF como formato principal); no ampliar ni restringir sin aprobación explícita.
- Tamaño: respetar límites de Email Workers; no fijar umbrales adicionales en este diseño.
- Registrar en trazas cuál adjunto se usó y cuáles se descartaron.

## Equivalencia funcional
- Ambos manejadores (`fetch` y `email`) deben producir exactamente el mismo objeto requerido por el Workflow.
- Metadatos de correo viajan solo como opcionales; no cambian nombres ni tipos de los campos requeridos.
- No se introducen validaciones más estrictas en HTTP; la compatibilidad con el Front End y el Workflow actual se conserva.

## Referencias oficiales
- Handlers en Workers (fetch/email): https://developers.cloudflare.com/workers/runtime-apis/handlers/
- Email Workers y EmailEvent: https://developers.cloudflare.com/email-routing/email-workers/runtime-api/
- Email Workers (overview): https://developers.cloudflare.com/email-routing/email-workers/
- Workflows – Trigger desde Workers: https://developers.cloudflare.com/workflows/build/trigger-workflows/
- Workflows – Events and parameters: https://developers.cloudflare.com/workflows/build/events-and-parameters/
- Workers – Bindings (KV, R2, D1, Workflows): https://developers.cloudflare.com/workers/runtime-apis/bindings/
