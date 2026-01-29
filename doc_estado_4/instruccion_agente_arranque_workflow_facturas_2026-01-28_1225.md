# Instrucción para el agente desarrollador responsable del Workflow de procesamiento de facturas

## Contexto y finalidad
El sistema recibe archivos de factura que se almacenan en Cloudflare R2. Tras la subida, un flujo HTTP invoca el Workflow `wf-procesar-factura` para procesar la factura asociada. El Front End ya maneja una respuesta inmediata con indicadores de éxito esperados para la subida y para el arranque del Workflow. Esta instrucción exige documentar, sin ambigüedades, el comportamiento real en el momento de arranque del Workflow y la estructura de la respuesta inmediata que se devuelve al sistema que informa al Front End. La tarea no cubre fases posteriores ni consultas diferidas.

## Observaciones técnicas clave del sistema actual
- Punto de entrada HTTP: la ruta `/` (y `/api/facturas/resolver-id` solo con prueba GET) en `src/index.ts` acepta exclusivamente solicitudes POST para iniciar el Workflow. Las rutas no contempladas responden 404; los métodos distintos de POST responden 405.
- Datos mínimos obligatorios en el cuerpo JSON de arranque: `invoiceId`, `r2Key`, `originalFileName`, `contentType`, `fileUrl`. La ausencia de cualquiera produce 400 con mensaje "Faltan campos obligatorios en el evento de factura". El cuerpo no válido produce 400 con "Cuerpo JSON no válido".
- Componente que invoca el Workflow: la misma función HTTP en `src/index.ts` llama a `env.WF_PROCESAR_FACTURA.create` con `params: payload`. En la vía de correo electrónico (`email` handler), el sistema genera el archivo en R2, construye `fileUrl` público y encola el mismo Workflow con un `payload` que añade `emailMeta`.
- Correlación con el archivo en R2: el `payload` usa `invoiceId` (identificador generado por el invocador) y `r2Key` (clave de almacenamiento en R2). La correlación se mantiene porque el Workflow vuelve a descargar el archivo desde `fileUrl` y lo sube a `r2Key`. No hay comprobación interna de duplicidad previa al arranque; la unicidad depende del `invoiceId` y de la clave R2 proporcionada.
- Validaciones iniciales dentro del Workflow (`src/workflow.ts`): se extraen del `payload` los campos `invoiceId`, `fileUrl`, `r2Key`, `originalFileName`, `contentType`. La ejecución falla si no existe configuración obligatoria `R2_FACTURAS_PREFIX` o `OPENAI_API_KEY` en KV, o si no hay plantilla `facturas-extraer-texto` en KV. El Workflow persiste errores de validación en R2 como `error_validacion_factura.json` bajo el prefijo `R2_FACTURAS_PREFIX`.
- Respuesta inmediata actual al arranque exitoso (HTTP): `{ "workflow": "wf-procesar-factura", "instancia_id": <identificador de instancia> }` con cabecera `Content-Type: application/json` y estado 200. No incluye indicadores separados para subida o arranque; el éxito se infiere por el estado 200.
- Respuesta inmediata en error de arranque (HTTP): 404 para rutas no contempladas, 405 para métodos no permitidos, 400 para JSON no válido o campos obligatorios ausentes. Los mensajes son texto plano en español. No se devuelve identificador de referencia en estos casos.

## Tareas que debes realizar
1. Documenta el punto de entrada del Workflow y la información de invocación
   - Describe qué componente invoca el Workflow tras la subida a Cloudflare R2 y qué rutas HTTP están habilitadas para ello.
   - Enumera todos los campos que el invocador transmite al Workflow en el arranque (`invoiceId`, `r2Key`, `originalFileName`, `contentType`, `fileUrl`, y `emailMeta` cuando proviene de correo).
   - Indica qué campos son obligatorios y qué efecto tiene la ausencia o invalidez de cada uno en la respuesta inmediata.
2. Define los criterios actuales para considerar que el Workflow se ha iniciado correctamente
   - Expone las condiciones que debe cumplir la llamada inicial para que `env.WF_PROCESAR_FACTURA.create` se ejecute y devuelva una instancia.
   - Detalla las validaciones iniciales sobre los datos de entrada y sobre la configuración requerida en KV y R2. Incluye cómo se registra un error temprano en R2 si la validación de RO falla.
   - Señala cómo se evita o no se evita la duplicidad de arranques respecto a un mismo archivo o `invoiceId`.
3. Documenta la estructura de la respuesta inmediata en caso de éxito
   - Describe la forma exacta del cuerpo JSON devuelto (campos `workflow` y `instancia_id`) y el estado HTTP.
   - Identifica claramente que el éxito de la subida a R2 no se reporta explícitamente en este punto; el éxito de arranque se infiere por el estado 200 y la presencia de `instancia_id`.
   - Lista los identificadores devueltos: nombre del Workflow (`wf-procesar-factura`) y `instancia_id` generado por la plataforma de Workflow.
4. Documenta la estructura de la respuesta inmediata en caso de error en el arranque
   - Enumera los códigos y cuerpos devueltos para rutas no válidas, métodos no permitidos, cuerpo JSON inválido o campos obligatorios faltantes.
   - Indica qué información de referencia no se devuelve en estos casos y las implicaciones para trazabilidad.
   - Describe qué errores se registran en R2 en la fase inicial y bajo qué claves (por ejemplo, `error_validacion_factura.json`).
5. Alinea la respuesta inmediata con las expectativas del Front End
   - Contrasta los campos que el Front End espera como indicadores de éxito de subida y arranque con los campos que realmente devuelve la respuesta inmediata actual.
   - Señala cualquier diferencia de nomenclatura o ausencia de indicadores explícitos y especifica cuál es el contrato de referencia que debe considerarse.
   - Detalla qué campos debe utilizar el Front End para: decidir éxito binario en esta fase, confirmar aceptación de la factura para procesamiento y mostrar un código de referencia para soporte.
6. Produce un documento técnico de referencia
   - Entrega un documento estructurado que cubra: punto de entrada y datos recibidos, criterios de aceptación del arranque, respuesta inmediata en éxito, respuesta inmediata en error, y alineación con el contrato del Front End.
   - Asegura que el documento refleje exclusivamente el comportamiento efectivo actual, sin proponer cambios ni mejoras.

## Requisitos formales del resultado
- Redacción en lenguaje técnico claro y estructurado, sin abreviaturas ajenas a los nombres propios del sistema ni a los identificadores ya existentes.
- No incluir fragmentos de código, comandos ni instrucciones operativas.
- No añadir suposiciones ni comportamientos inexistentes en el entorno actual.
- Guardar el resultado en `doc_estado_4/[NombreArchivo]_YYYY-MM-DD_HHMM.md`, usando la fecha y hora de generación.

## Resultado esperado
Un documento técnico de referencia que describa completa y claramente cómo se inicia el Workflow de procesamiento de facturas a partir de un archivo almacenado en Cloudflare R2 y qué respuesta inmediata se genera hacia el sistema que comunica con el Front End, tanto en éxito como en error, fijando el contrato de integración en esta fase inicial.
