# Marco funcional limpio del Workflow de facturas

Fecha: 2026-01-28 11:41
Ámbito: síntesis funcional del flujo real del Workflow, alineada con E1–E4. No se proponen cambios ni rediseños. Compatibilidad estricta con el Worker Fetch/HTTP en producción y el frontal en Pages.

## 1. Objetivo
Documentar, en términos funcionales y en el orden real de ejecución, las fases del Workflow de facturas, señalando puntos críticos, uso de identificadores (`invoiceId`, `factura_id`), configuración centralizada y la regla de prefijo único en R2. Sin alterar contratos ni añadir estados.

## 2. Fases funcionales (orden real)
| Fase | Descripción funcional | Entradas clave | Salida/estado funcional | Continuación / fallo |
|---|---|---|---|---|
| Inicio (evento) | El Workflow arranca al recibir el evento encolado por el Worker (HTTP o email). Se toma `invoiceId`, `fileUrl`, `r2Key`, nombre original y `contentType`. | Payload del Worker con `invoiceId` y datos de archivo. | Contexto inicial del caso de factura. | Continúa a extracción; si faltan datos, el Worker ya habría rechazado antes. |
| Extracción de texto (IA) | Descarga el PDF desde `fileUrl`, lo regraba en R2 con `r2Key`, obtiene API key y plantilla desde KV, envía a OpenAI y guarda el resultado en `facturas/<invoiceId>/facturas-extraer-texto.json`. | `r2Key`, `fileUrl`, claves KV `OPENAI_API_KEY` y plantilla. | Artefacto de extracción en R2; `invoiceId` como eje de ruta. | Si falla descarga o IA: guarda JSON de error en R2 y detiene el flujo (fallo temprano). |
| Lectura y validación de RO | Lee `facturas/<invoiceId>/facturas-extraer-texto.json`, extrae `output`, valida estructura de `datos_generales` y `lineas`. | Artefacto IA en R2, `invoiceId`. | RO validado listo para negocio. | Si inválido: escribe `error_validacion_factura.json` ligado al PDF y detiene (fallo temprano). |
| Resolución de proveedor | Valida mínimos de proveedor y resuelve/crea empresa en D1. Usa `invoiceId` en trazas, obtiene `empresaId`. | RO validado; metadatos (`invoiceId`, `r2_pdf_key`, `file_url`, nombre, contentType). | `empresaId` asociado; proveedor normalizado. | Si falla D1/proveedor: escribe error en R2 y detiene (fallo intermedio). |
| Cabecera de factura | Valida cabecera, normaliza número de factura, elimina factura previa del mismo emisor/número si existía, inserta nueva cabecera en `fat_facturas`. | `empresaId`, RO cabecera, metadatos. | `factura_id` generado; número normalizado. | Si falla inserción/validación: error en R2 y detiene (fallo intermedio). |
| Registro de archivo (pendiente) | Crea/actualiza `fat_facturas_archivos` con `invoiceId`, `factura_id`, claves R2 del PDF y estado `pendiente`. | `factura_id`, `invoiceId`, claves R2, nombre original, `file_url`. | Metadato de archivo vinculado a factura en estado pendiente. | Si inconsistente o falla: error en R2 y detiene (fallo intermedio). |
| Líneas de factura | Valida líneas, borra líneas previas y reinsertar en `fat_factura_lineas` para el `factura_id`. | RO líneas, `factura_id`, `empresaId`, número/proveedor normalizados. | Líneas persistidas para la factura. | Si falla validación/insert: error en R2 y detiene (fallo intermedio). |
| Generación de Excel y cierre | Lee cabecera y líneas desde D1, genera Excel, lo sube a R2, actualiza `fat_facturas_archivos` a `validada` con `r2_excel_key`. | `factura_id`, `invoiceId`, claves R2, datos de cabecera/líneas. | Artefacto Excel en R2; metadatos marcados `validada`. | Si falla: error en R2; flujo termina en error final. |

## 3. Puntos críticos del flujo
- Inicio y carga de PDF: fallo en descarga o guardado bloquea todo (fallo temprano). `invoiceId` ya es la referencia clave.
- Validación de RO: cualquier inconsistencia detiene antes de tocar D1.
- Resolución proveedor / cabecera: primer uso de D1; fallo aquí evita creación de `factura_id` o la deja sin avanzar.
- Upsert de `fat_facturas_archivos`: asegura vínculo `invoiceId`↔`factura_id`; inconsistencias frenan antes de pasar a líneas.
- Líneas: validación y persistencia completa; fallo evita Excel y estado `validada`.
- Excel: último paso; si falla, deja la factura sin marcar como `validada` y registra error.

## 4. Alineación con E1–E4
- Contrato Worker (E1/E2): No se modifica; el Workflow parte del payload `invoiceId/r2Key/...` recibido. Compatible con Fetch/HTTP en producción.
- Identificadores canónicos: `invoiceId` (trazabilidad R2 y `fat_facturas_archivos`), `factura_id` (PK de cabecera y FK de líneas/archivos). Transición ocurre al insertar cabecera.
- Registros técnicos fijos (E3): No se usan aún en el flujo; deben confirmarse externamente antes de integrar.
- Prefijo único R2 (E4): Artefactos IA ya usan `facturas/<invoiceId>/...`; ingesta correo usa `email/<invoiceId>/...`. Regla de prefijo único "facturas" está documentada para futura normalización, sin cambios ahora.
- KV: uso actual limitado a `OPENAI_API_KEY`, plantilla `facturas-extraer-texto`, `SHEETJS_TEST_TOKEN` (ruta de prueba). Claves adicionales (`R2_FACTURAS_PREFIX`, IDs técnicos) están documentadas pero no consumidas.

## 5. Preparación conceptual para campo `log` (sin diseñar ni implementar)
- Fases donde registrar eventos tendría sentido: inicio de caso (`invoiceId` recibido), guardado PDF/URL pública, petición/respuesta IA, validación RO (éxito/error), resolución proveedor, inserción cabecera (`factura_id` emitido), upsert `fat_facturas_archivos` (pendiente/validada), inserción de líneas, generación/subida de Excel, y cualquier error capturado que ya se persiste en R2.
- Solo indicación conceptual: no se definen formatos ni cambios de código.

## 6. Advertencias y compatibilidad
- No se rediseña ni se añaden estados. Se describe el flujo existente. Cualquier futura adaptación debe mantener el contrato Fetch/HTTP vigente y el comportamiento observable del frontal en Pages.
- Ambigüedades (prefijos históricos en R2, IDs técnicos en D1, valores KV no usados) requieren confirmación externa antes de decisiones de implementación.
