# Informe técnico – Contexto actual flujo de facturas

Fecha: 2026-01-28 11:00
Ámbito: documentación descriptiva del estado actual (Cloudflare Worker, Workflow, D1, R2, KV, identificadores `invoiceId` y `factura_id`, literales). No se proponen cambios.

## 1) Contrato actual del Cloudflare Worker (frontal Pages ↔ Worker)
- Rutas relevantes:
  - POST `/`: valida cuerpo JSON y exige campos `invoiceId`, `r2Key`, `originalFileName`, `contentType`, `fileUrl`. Si falta alguno → 400; si método no es POST → 405. En caso válido, encola Workflow y responde 200 con `{ workflow: "wf-procesar-factura", instancia_id: <uuid> }` ([workers/wf-procesar-factura/src/index.ts](workers/wf-procesar-factura/src/index.ts#L9-L38)).
  - GET `/prueba-sheetjs`: requiere token `SHEETJS_TEST_TOKEN` en header `x-test-token` o query `token`; si falta o no coincide → 403. Si coincide, lee hasta 10 líneas de `fat_factura_lineas`, genera XLSX y lo guarda en R2; responde 200 JSON `{ ok: true, key }` o 404 si no hay datos, 500 si falla ([workers/wf-procesar-factura/src/index.ts#L40-L91](workers/wf-procesar-factura/src/index.ts#L40-L91)).
- Punto de entrada email (no usado por Pages pero existente): manejador `email` recibe adjunto, lo sube a R2 y encola el mismo Workflow con el payload equivalente ([workers/wf-procesar-factura/src/index.ts#L13-L77](workers/wf-procesar-factura/src/index.ts#L13-L77)).
- Dependencias visibles desde Worker: Workflow binding `WF_PROCESAR_FACTURA`, KV `NSKV_SECRETOS` y `NSKV_PROMPTS`, R2 `R2_FACTURAS`, D1 `DB_FAT_EMPRESAS` (usado en ruta de prueba) ([workers/wf-procesar-factura/src/types/env.ts](workers/wf-procesar-factura/src/types/env.ts#L1-L14)).

## 2) Flujo funcional del Cloudflare Workflow (procesar factura)
- Clase `ProcesarFacturaWorkflow.run` define pasos secuenciales ([workers/wf-procesar-factura/src/workflow.ts](workers/wf-procesar-factura/src/workflow.ts)):
  1. `wf-facturas-extraer-texto`: descarga PDF desde `fileUrl`, lo guarda en R2 (`r2Key`), arma URL pública, lee `OPENAI_API_KEY` (KV) y plantilla `facturas-extraer-texto` (KV), construye `requestBody`, llama a OpenAI, guarda JSON de éxito en R2 `facturas/<invoiceId>/facturas-extraer-texto.json`; en error, guarda JSON de error y relanza.
  2. `lectura-apioresponse`: lee `facturas/<invoiceId>/facturas-extraer-texto.json` desde R2, extrae/parsea `apioResponse.output`, valida y normaliza RO; en error escribe `error_validacion_factura.json` junto al PDF y relanza.
  3. `proveedor_fat_empresas`: valida entrada mínima, normaliza nombre de proveedor y resuelve/crea empresa en D1 (`fat_empresas`); en error escribe payload en R2 y relanza.
  4. `cabecera_fat_empresas`: valida cabecera, normaliza número de factura, borra factura previa del mismo emisor/numero (`overwriteFacturaSiExiste` elimina cabecera y líneas), inserta cabecera en `fat_facturas`; en error escribe payload en R2 y relanza.
  5. `fat_facturas_archivos` (primer upsert): inserta/actualiza `fat_facturas_archivos` con `invoiceId`, `factura_id`, claves R2 y estado `pendiente`; en error escribe payload en R2 y relanza.
  6. `lineas_fat_empresas`: valida líneas, borra líneas previas y las inserta en `fat_factura_lineas`; en error escribe payload en R2 y relanza.
  7. `excel_fat_empresas`: lee cabecera y líneas desde D1, genera XLSX, lo sube a R2, y actualiza `fat_facturas_archivos` con estado `validada` y `r2_excel_key`; en error escribe payload en R2 y relanza.
- Interacciones por recurso: KV (OPENAI_API_KEY, plantilla prompt), R2 (PDF y JSON de OpenAI, Excel, errores), D1 (fat_empresas, fat_facturas, fat_factura_lineas, fat_facturas_archivos), no hay más KV leídos en workflow.

## 3) Modelo de datos relevante (según uso en código)
- `fat_empresas`: usado para resolver `empresaId` por NIF y nombre en `resolveProveedorEmpresa` (definición no visible en repo). Campos referenciados: `id`, `nif_proveedor`, `nombre_proveedor` (desde selects de Excel) ([workers/wf-procesar-factura/src/lib/excel.ts](workers/wf-procesar-factura/src/lib/excel.ts#L1-L80)).
- `fat_facturas`: campos usados al insertar cabecera: `emisor_id`, `numero_factura`, `numero_factura_normalizado`, `fecha_emision`, `moneda`, totales, `observaciones`; PK `id` se usa como `factura_id` ([workers/wf-procesar-factura/src/lib/cabecera.ts](workers/wf-procesar-factura/src/lib/cabecera.ts#L52-L116)). Borrado previo y reinserción en `overwriteFacturaSiExiste` ([workers/wf-procesar-factura/src/lib/cabecera.ts#L28-L50](workers/wf-procesar-factura/src/lib/cabecera.ts#L28-L50)).
- `fat_factura_lineas`: se borra e inserta completa; campos usados: `factura_id`, `descripcion`, `codigo_producto`, `cantidad`, `precio_unitario`, `porcentaje_iva`, `importe_base`, `importe_impuesto`, `importe_total_linea`, `orden` ([workers/wf-procesar-factura/src/lib/lineas.ts](workers/wf-procesar-factura/src/lib/lineas.ts#L61-L116)).
- `fat_facturas_archivos`: usada con upsert por `invoiceId`; campos: `factura_id`, `invoiceId`, `r2_pdf_key`, `original_file_name`, `file_url`, `estado_validacion`, `r2_excel_key`. Estados usados: literales `pendiente` y `validada` ([workers/wf-procesar-factura/src/lib/archivos.ts](workers/wf-procesar-factura/src/lib/archivos.ts#L1-L70), [workers/wf-procesar-factura/src/workflow.ts#L29-L36](workers/wf-procesar-factura/src/workflow.ts#L29-L36)). No hay columnas adicionales visibles (p. ej. `log` no se usa en el código). No hay definiciones DDL en el repositorio.

## 4) Uso real de `invoiceId` y `factura_id`
- Generación de `invoiceId`:
  - En HTTP: llega ya en el payload del frontal; se valida y se pasa al Workflow ([workers/wf-procesar-factura/src/index.ts#L21-L33](workers/wf-procesar-factura/src/index.ts#L21-L33)).
  - En email: se genera `crypto.randomUUID()` antes de subir el PDF a R2 y se pasa en el payload del Workflow ([workers/wf-procesar-factura/src/index.ts#L47-L69](workers/wf-procesar-factura/src/index.ts#L47-L69)).
- Uso de `invoiceId` en Workflow: clave de trazabilidad en R2 (`facturas/<invoiceId>/...`), clave de búsqueda para `fat_facturas_archivos` (upsert) y para mensajes de log/errores.
- Generación de `factura_id`: se obtiene al insertar cabecera en `fat_facturas` (`insertarCabeceraFactura` retorna `id`) ([workers/wf-procesar-factura/src/lib/cabecera.ts#L78-L116](workers/wf-procesar-factura/src/lib/cabecera.ts#L78-L116)).
- Relación entre ambos: `invoiceId` se usa para crear/actualizar fila en `fat_facturas_archivos`. Esa fila guarda `factura_id` y, más adelante, se actualiza con `r2_excel_key` cuando el Excel se genera ([workers/wf-procesar-factura/src/lib/archivos.ts#L14-L70](workers/wf-procesar-factura/src/lib/archivos.ts#L14-L70)).
- Transición: el flujo inicia con solo `invoiceId` (de evento). Tras crear cabecera se obtiene `factura_id`; desde ese momento se borran/insertan líneas, se generan Excel y se reescribe `fat_facturas_archivos` con ambos identificadores.

## 5) Registros técnicos fijos (“Sin Proveedor Identificado”, “Facturas Fallidas”)
- No se encuentran referencias en el código a IDs fijos, literales o claves KV que representen estos registros. No hay consultas ni inserciones que usen valores especiales para estos conceptos. Por tanto, su existencia/uso no está evidenciada en el repositorio actual.

## 6) Configuración en Cloudflare KV relevante al flujo
- Claves usadas en código:
  - `OPENAI_API_KEY` leída desde `NSKV_SECRETOS` (Workflow paso P1).
  - `facturas-extraer-texto` leída desde `NSKV_PROMPTS` (Workflow paso P1) como plantilla de petición a OpenAI.
  - `SHEETJS_TEST_TOKEN` leída desde `NSKV_SECRETOS` en ruta de prueba `/prueba-sheetjs` (Worker).
- Claves solicitadas en el objetivo (`R2_FACTURAS_PREFIX`, `SIN_PROVEEDOR_EMPRESA_ID`, `FACTURAS_FALLIDAS_FACTURA_ID`) no aparecen en el código.

## 7) Dependencias a valores literales críticos en código
- Estados de validación: `pendiente`, `validada` ([workers/wf-procesar-factura/src/workflow.ts#L29-L36](workers/wf-procesar-factura/src/workflow.ts#L29-L36)).
- Prefijo/URL R2 pública: `https://pub-4e5e6e57e45848fbbbec281180517b6e.r2.dev/` embebida al construir URLs y claves (Worker email y Workflow P1) ([workers/wf-procesar-factura/src/index.ts#L68-L90](workers/wf-procesar-factura/src/index.ts#L68-L90), [workers/wf-procesar-factura/src/workflow.ts#L65-L79](workers/wf-procesar-factura/src/workflow.ts#L65-L79)).
- Selección de MIME: `application/pdf` (set estático) para elegir adjunto ([workers/wf-procesar-factura/src/index.ts#L5-L33](workers/wf-procesar-factura/src/index.ts#L5-L33)).
- No hay literales para registros técnicos (“Sin Proveedor Identificado”, “Facturas Fallidas”) ni para `R2_FACTURAS_PREFIX` en el código.

## 8) Documento de referencia consolidado (este archivo)
- Contiene: contrato Worker (rutas, métodos, entradas, respuestas), flujo del Workflow, uso de `invoiceId` y `factura_id`, modelo de datos usado por el código, ausencia de registros técnicos fijos y claves KV consultadas, literales críticos presentes.
- Sin propuestas de cambio ni rediseño; describe solo el comportamiento observable en el repositorio a fecha de generación.
