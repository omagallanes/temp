# Plan de implantación para habilitar entrada por correo y HTTP en el Worker wf-procesar-factura

## Contexto y objetivo
El Worker actual de wf-procesar-factura recibe eventos por HTTP y encola ejecuciones del Workflow asociado. El objetivo es añadir entrada por correo mediante Cloudflare Email Routing sin modificar la lógica del Workflow, unificando la validación y normalización para generar un evento equivalente al que hoy ingresa por HTTP. No se tocan otros componentes.

## Fase 1: Inventario técnico y estado actual (solo Worker)
- Punto de entrada HTTP: manejador `fetch` en [workers/wf-procesar-factura/src/index.ts](workers/wf-procesar-factura/src/index.ts#L5-L29). Rutas:
  - `GET /prueba-sheetjs`: ruta de prueba que genera y almacena una hoja de cálculo en R2 tras validar un token en Workers KV y leer datos de D1.
  - `POST /`: ruta principal que valida JSON, requiere `invoiceId`, `r2Key`, `originalFileName`, `contentType`, `fileUrl`. Si faltan campos devuelve error. Si es válido crea instancia del Workflow.
- Dependencias y bindings (de [workers/wf-procesar-factura/wrangler.toml](workers/wf-procesar-factura/wrangler.toml#L1-L15)):
  - Workers KV: `NSKV_SECRETOS`, `NSKV_PROMPTS`.
  - R2 bucket: `R2_FACTURAS`.
  - Base de datos D1: `DB_FAT_EMPRESAS`.
  - Workflow binding: `WF_PROCESAR_FACTURA` (clase `ProcesarFacturaWorkflow`).
- Punto de delegación a Workflows: en `fetch` se invoca `env.WF_PROCESAR_FACTURA.create({ id: crypto.randomUUID(), params: payload })` y responde con identificador de instancia (ver [workers/wf-procesar-factura/src/index.ts](workers/wf-procesar-factura/src/index.ts#L22-L28)).

## Fase 2: Contrato de entrada unificado y equivalencia funcional
- Contrato lógico de evento unificado (derivado del actual POST):
  - `invoiceId`: identificador único del evento de factura.
  - `r2Key`: clave de almacenamiento en R2 para el archivo fuente.
  - `originalFileName`: nombre original del archivo recibido.
  - `contentType`: tipo de contenido declarado del archivo.
  - `fileUrl`: URL accesible para descargar el archivo fuente.
  - Campos adicionales opcionales pueden mantenerse transparentes si llegan en el payload.
- Mapeo desde correo al contrato unificado (Email Routing entrega `EmailEvent`):
  - `invoiceId`: generado en el Worker (por ejemplo, UUID) o derivado de encabezados si existe un identificador trazable.
  - `originalFileName`: tomado del adjunto principal de la factura.
  - `contentType`: tomado del adjunto principal.
  - `r2Key`: clave calculada al guardar el adjunto en R2, usando convención alineada con los eventos HTTP actuales.
  - `fileUrl`: URL presignada o de acceso interno tras subir el adjunto a R2 para uso del Workflow.
  - Otros campos del mensaje (remitente, asunto, cuerpo) pueden conservarse en campos adicionales si se requieren para auditoría sin alterar el contrato principal.
- Validaciones mínimas comunes (HTTP y correo):
  - Presencia y formato de `invoiceId`, `r2Key`, `originalFileName`, `contentType`, `fileUrl`.
  - Coherencia del tipo declarado (`contentType`) con el archivo almacenado.
  - Construcción de respuesta clara ante errores de validación.
- Validaciones específicas de correo (sin fijar límites no documentados):
  - Presencia de al menos un adjunto; seleccionar el adjunto de factura según criterio definido (por ejemplo, primer adjunto o adjunto con tipo permitido).
  - Tipo de fichero permitido según caso de uso (por ejemplo, PDF u hoja de cálculo), alineado con la lógica actual del Workflow.
  - Verificar que el tamaño del adjunto cumple las restricciones publicadas por Cloudflare Email Workers y las políticas internas, sin fijar valores numéricos en este plan.
  - Rechazo claro si falta adjunto o el tipo no es aceptado.

## Fase 3: Diseño del manejo de correo en el Worker (sin implementación)
- Convivencia de manejadores: el Worker expondrá `fetch` y `email` en el mismo script. `fetch` mantiene las rutas actuales. `email` procesará eventos de Email Routing y generará el mismo contrato unificado antes de delegar al Workflow.
- Flujo lógico del manejador `email`:
  1. Recepción del `EmailEvent` con metadatos y adjuntos.
  2. Selección y extracción del adjunto de factura.
  3. Validaciones específicas de correo (adjunto presente, tipo aceptado, tamaño permitido según política, consistencia de nombre y tipo).
  4. Subida del adjunto a R2 con clave calculada (`r2Key`) y obtención de `fileUrl` utilizable por el Workflow.
  5. Construcción del evento unificado con `invoiceId`, `r2Key`, `originalFileName`, `contentType`, `fileUrl`, más metadatos opcionales.
  6. Delegación al Workflow mediante el mismo binding y parámetros que la ruta HTTP.
  7. Respuesta del manejador `email` indicando aceptación o rechazo, con trazabilidad mínima.
- Respuesta y trazabilidad:
  - Aceptación: registro mínimo que incluya identificador generado y `r2Key` usado; respuesta conforme a las capacidades de Email Workers (por ejemplo, `accept` o equivalente según API).
  - Rechazo: mensaje claro indicando causa (sin exponer información sensible), registrando causa y contexto.
  - Prevención de duplicados: criterio basado en identificador externo si existe (cabecera de mensaje) o en huella del adjunto; documentar la elección y mantenerla coherente con HTTP.

## Fase 4: Requisitos de configuración en Cloudflare (Email Routing y Worker)
- Prerrequisitos para habilitar Email Routing:
  - Activar Email Routing en el dominio y aplicar registros de tipo MX que Cloudflare indique. Un cambio incorrecto de registros MX puede interrumpir el enrutamiento de correo existente.
  - Verificar propiedad del dominio y estado de propagación de DNS antes de redirigir tráfico real.
- Pasos de alto nivel para que Email Routing entregue mensajes al Worker:
  - Habilitar Email Workers en la zona deseada.
  - Crear reglas de enrutamiento que dirijan las direcciones o alias de interés al Worker wf-procesar-factura.
  - Confirmar que las reglas no interfieren con otras rutas de correo existentes.
- Bindings y configuraciones del Worker a revisar para el nuevo manejador `email`:
  - `R2_FACTURAS`: necesario para almacenar adjuntos recibidos por correo.
  - `NSKV_SECRETOS`: puede alojar tokens o llaves relacionadas con validación de correo si se añaden.
  - `NSKV_PROMPTS`: sin cambios obligatorios, pero verificar que no se requiere modificación para el flujo de correo.
  - `DB_FAT_EMPRESAS`: sin cambios en este plan, pero asegurar que permisos y cuotas contemplan el nuevo origen.
  - `WF_PROCESAR_FACTURA`: confirmar que el binding es accesible desde ambos manejadores.
  - Variables de entorno adicionales si se requieren para validaciones de correo (por ejemplo, lista de remitentes permitidos) deben documentarse y añadirse en wrangler sin afectar la lógica existente.

## Fase 5: Integración con Cloudflare Workflows (solo interfaz de invocación)
- Interfaz de invocación desde el Worker: uso del binding `WF_PROCESAR_FACTURA` con `create({ id: <uuid>, params: <evento unificado> })`, como se observa en [workers/wf-procesar-factura/src/index.ts](workers/wf-procesar-factura/src/index.ts#L22-L28) y declarado en [workers/wf-procesar-factura/wrangler.toml](workers/wf-procesar-factura/wrangler.toml#L9-L15).
- Transmisión consistente del evento unificado:
  - Tanto el manejador `fetch` como el manejador `email` deben construir el mismo objeto de parámetros y entregarlo como `params` al crear la instancia del Workflow.
  - Si se añaden metadatos adicionales específicos de correo, incluirlos como campos adicionales no disruptivos para la lógica actual del Workflow, evitando cambiar nombres o tipos existentes.

## Fase 6: Checklist de verificación previo al despliegue
- Verificación de configuración de Email Routing:
  - Email Routing habilitado en la zona objetivo.
  - Registros MX aplicados y propagados según indicaciones de Cloudflare.
  - Reglas de enrutamiento creadas que dirigen las direcciones o alias esperados al Worker.
  - Direcciones de destino verificadas si aplica el flujo de reenvío.
- Verificación del Worker:
  - Presencia de ambos manejadores (`fetch` y `email`) en el bundle final.
  - Validaciones mínimas comunes implementadas y coherentes para ambos orígenes.
  - Normalización al contrato unificado sin alterar la lógica del Workflow.
  - Respuestas claras para aceptación y rechazo en ambos manejadores.
- Verificación de bindings y recursos:
  - Workers KV (`NSKV_SECRETOS`, `NSKV_PROMPTS`) configurados y accesibles.
  - R2 (`R2_FACTURAS`) con permisos adecuados para escritura de adjuntos y lectura posterior.
  - D1 (`DB_FAT_EMPRESAS`) accesible para rutas de prueba y cualquier dependencia actual.
  - Workflow binding (`WF_PROCESAR_FACTURA`) disponible y con clase declarada correctamente.
- Verificación de autenticación por token para despliegue con Wrangler:
  - Token de API creado con permisos mínimos necesarios para desplegar el Worker y gestionar Email Routing.
  - Variables de entorno de sistema para Wrangler revisadas (por ejemplo, `CLOUDFLARE_API_TOKEN`).
  - Alcances del token revisados para evitar privilegios excesivos.
- Verificación de trazabilidad:
  - Registros esperados en ambos manejadores que incluyan identificadores de instancia y claves usadas en R2.
  - Mensajes de error coherentes y diferenciados para validaciones comunes y específicas de correo.
  - Criterios de aceptación y rechazo documentados y aplicados de forma uniforme.

## Further Considerations
- Confirmar límites de tamaño y tipos de adjunto aceptados según el caso de uso y las restricciones de Cloudflare Email Workers, y documentarlos antes de implementar validaciones.
- Acordar las direcciones, alias y reglas de enrutamiento que entregarán correo al Worker para evitar colisiones con flujos existentes.
- Definir política de deduplicación entre eventos HTTP y correo (por identificador externo, huella del adjunto o ambos) y alinearla con el modelo de datos en D1 y R2.

## Referencias oficiales
- Manejadores de Cloudflare Workers (fetch y lista de manejadores): https://developers.cloudflare.com/workers/runtime-apis/handlers/
- Email Workers y API de tiempo de ejecución (evento de correo): https://developers.cloudflare.com/email-routing/email-workers/runtime-api/
- Habilitar Email Routing: https://developers.cloudflare.com/email-routing/get-started/enable-email-routing/
- Habilitar Email Workers: https://developers.cloudflare.com/email-routing/email-workers/enable-email-workers/
- Disparar Workflows desde Workers: https://developers.cloudflare.com/workflows/build/trigger-workflows/
- Workers API de Workflows: https://developers.cloudflare.com/workflows/build/workers-api/
- Parámetros y eventos en Workflows: https://developers.cloudflare.com/workflows/build/events-and-parameters/
- Bindings de Workers y acceso a recursos: https://developers.cloudflare.com/workers/runtime-apis/bindings/
- Workers KV: https://developers.cloudflare.com/kv/
- Variables de entorno para autenticación por token en Wrangler: https://developers.cloudflare.com/workers/wrangler/system-environment-variables/
- Creación de token de la interfaz de programación de aplicaciones: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
