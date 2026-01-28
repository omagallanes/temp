# Informe GIP-AC – wf-procesar-factura

## Flujo actual
- Ingesta por correo: manejador email guarda adjunto primario (prioriza PDF por contentType, luego sufijo .pdf, si no, primer adjunto con contentType) y encola workflow con metadatos de correo y R2. Fallback de parsing via PostalMime cuando attachments viene vacío. Ver [workers/wf-procesar-factura/src/index.ts](workers/wf-procesar-factura/src/index.ts).
- Ingesta HTTP: POST / valida invoiceId, r2Key, originalFileName, contentType, fileUrl y encola el mismo workflow; GET /prueba-sheetjs genera XLSX de prueba en R2. Ver [workers/wf-procesar-factura/src/index.ts](workers/wf-procesar-factura/src/index.ts#L1-L120).
- Workflow pasos (Workflows): descarga el PDF desde fileUrl y lo regraba en R2, pide prompt facturas-extraer-texto a OpenAI, valida RO, resuelve proveedor en D1 (fat_empresas), inserta cabecera en fat_facturas, actualiza/crea fat_facturas_archivos, borra/reinserta líneas, genera Excel y vuelve a actualizar fat_facturas_archivos con estado validada y r2_excel_key. Ver [workers/wf-procesar-factura/src/workflow.ts](workers/wf-procesar-factura/src/workflow.ts).

## Tabla fat_facturas_archivos
- Escritura en dos momentos: tras insertar cabecera (estado pendiente, sin Excel) y tras generar Excel (estado validada, con r2_excel_key) ([workers/wf-procesar-factura/src/workflow.ts](workers/wf-procesar-factura/src/workflow.ts)).
- Upsert: busca por invoiceId; si existe con factura_id distinto, lanza error fat_facturas_archivos_inconsistente. Si coincide, hace UPDATE con COALESCE para no sobreescribir r2_excel_key con null; si no existe, hace INSERT ([workers/wf-procesar-factura/src/lib/archivos.ts](workers/wf-procesar-factura/src/lib/archivos.ts)).
- No hay DDL de la tabla en el repo; contrato asumido: columnas factura_id, invoiceId, r2_pdf_key, original_file_name, file_url, estado_validacion, r2_excel_key.

## Manejo de errores y trazas
- Cada paso captura excepciones específicas (ValidationFailure, ProveedorFailure, LineasFailure, ArchivosFailure) y escribe payload de error en R2 junto al PDF usando error_validacion_factura.json ([workers/wf-procesar-factura/src/lib/apioresponse.ts](workers/wf-procesar-factura/src/lib/apioresponse.ts)).
- P1 (OpenAI/R2) guarda éxito y, en error, duplica el JSON con timestamp para facilitar diagnóstico.
- Validaciones estrictas: RO solo permite datos_generales y lineas; numéricos se convierten y fallan si no son parseables; número de factura y nombre de proveedor se normalizan eliminando diacríticos y símbolos ([workers/wf-procesar-factura/src/lib/apioresponse.ts](workers/wf-procesar-factura/src/lib/apioresponse.ts), [workers/wf-procesar-factura/src/lib/cabecera.ts](workers/wf-procesar-factura/src/lib/cabecera.ts), [workers/wf-procesar-factura/src/lib/proveedor.ts](workers/wf-procesar-factura/src/lib/proveedor.ts)).
- En líneas, cualquier campo no numérico o vacío detiene el flujo y se guarda error en R2 ([workers/wf-procesar-factura/src/lib/lineas.ts](workers/wf-procesar-factura/src/lib/lineas.ts)).

## Riesgos / hallazgos
- No existe DDL de fat_facturas_archivos ni de otras tablas en el repo; cambios de esquema no rastreados.
- Email parsing depende de PostalMime solo cuando message.attachments viene vacío; si el proveedor envía MIME atípico y PostalMime falla, se pierde el correo sin reintento.
- overwriteFacturaSiExiste borra cabecera y líneas previas antes de reinsertar; si el flujo cae después y antes de recrear cabecera/líneas, la factura queda borrada.
- estado_validacion usa strings libres (pendiente/validada), sin enum central ni chequeo previo al upsert.
- No hay retentiva de logs centralizada; solo console.log/error y JSONs en R2.

## Recomendaciones
1) Documentar/añadir migración D1 con esquema de fat_facturas_archivos y claves únicas (invoiceId único, FK a fat_facturas).
2) Añadir reintento/alerta para errores de parsing de correo (PostalMime) y para descargas de PDF fallidas.
3) Incorporar estado intermedio o transacción para overwriteFacturaSiExiste + reinsertado de cabecera/líneas para evitar huecos si el workflow se corta.
4) Formalizar enum de estados en fat_facturas_archivos y validar entrada antes de upsert.
5) Registrar en R2 un log de flujo (p. ej. facturas/<invoiceId>/trace.jsonl) para diagnósticos sin depender de consola.
