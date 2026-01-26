# Fase 4 – Requisitos de configuración en Cloudflare (Email Routing y Worker)

## Alcance
- Preparar requisitos de configuración para habilitar entrada por correo en el mismo Worker que ya atiende HTTP, sin alterar la lógica del Workflow.
- No incluye pasos operativos ni comandos; solo prerrequisitos y elementos a revisar.

## Prerrequisitos para habilitar Email Routing
- Activar Email Routing en el dominio objetivo (referencia: https://developers.cloudflare.com/email-routing/get-started/enable-email-routing/).
- Aplicar los registros MX indicados por Cloudflare; cualquier error puede interrumpir el enrutamiento existente.
- Verificar propiedad del dominio y el estado de propagación DNS antes de mover tráfico real.

## Pasos de alto nivel para que Email Routing entregue al Worker
- Habilitar Email Workers en la zona deseada (referencia: https://developers.cloudflare.com/email-routing/email-workers/enable-email-workers/).
- Crear reglas de enrutamiento que dirijan las direcciones o alias definidos al Worker `wf-procesar-factura` (referencia general de Email Workers: https://developers.cloudflare.com/email-routing/email-workers/).
- Asegurar que dichas reglas no colisionen con otras rutas de correo en la zona.

## Bindings y configuraciones del Worker a revisar
- `R2_FACTURAS`: requerido para almacenar adjuntos recibidos por correo; debe ser accesible desde el manejador `email`.
- `NSKV_SECRETOS`: puede almacenar secretos adicionales si se usan para validar entradas de correo; ya existente para el Worker.
- `NSKV_PROMPTS`: sin cambios obligatorios; verificar si el flujo de correo reutiliza plantillas.
- `DB_FAT_EMPRESAS`: sin cambios en esta fase; garantizar permisos y cuotas suficientes si el flujo de correo incrementa uso.
- `WF_PROCESAR_FACTURA`: binding del Workflow; debe ser accesible desde ambos manejadores (`fetch` y `email`).
- Variables de entorno adicionales (si se usan para listas de remitentes o límites específicos): documentarlas y añadirlas en wrangler sin alterar la semántica actual del HTTP.

## Consideraciones de despliegue y seguridad
- Revisión del token de API para despliegue (referencia: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/ y variables de entorno para wrangler: https://developers.cloudflare.com/workers/wrangler/system-environment-variables/).
- Validar que los permisos del token cubren Email Routing y despliegue del Worker sin excesos de privilegio.

## Referencias oficiales
- Enable Email Routing: https://developers.cloudflare.com/email-routing/get-started/enable-email-routing/
- Enable Email Workers: https://developers.cloudflare.com/email-routing/email-workers/enable-email-workers/
- Email Workers (visión general): https://developers.cloudflare.com/email-routing/email-workers/
- Workers – Bindings (KV, R2, D1, Workflows): https://developers.cloudflare.com/workers/runtime-apis/bindings/
- Workflows – Trigger desde Workers: https://developers.cloudflare.com/workflows/build/trigger-workflows/
- Workflows – Events and parameters: https://developers.cloudflare.com/workflows/build/events-and-parameters/
- API token creation: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- Wrangler system environment variables: https://developers.cloudflare.com/workers/wrangler/system-environment-variables/
