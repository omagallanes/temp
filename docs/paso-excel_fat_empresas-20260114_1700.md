# Checklist: paso `excel_fat_empresas` (2026-01-14 17:00)

## Entradas
- `empresaId`, `facturaId`, `invoiceId`
- `metadatos`: `r2_pdf_key`, `file_url`, `nombre_original`, `contentType`
- `nombreNormalizadoProveedor`, `numeroFacturaNormalizado`

## Salidas
- XLSX en R2 con `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Clave R2: mismo prefijo que `r2_pdf_key`, nombre `{nombreNormalizadoProveedor}_{numeroFacturaNormalizado}.xlsx`
- `fat_facturas_archivos.r2_excel_key` actualizado por `invoiceId` (idempotente)
- `estado_validacion`: `validada` tras exportación (pendiente en metadatos iniciales)

## Columnas y orden aplicados
- Cabecera fila 1: nif_proveedor, nombre_proveedor, numero_factura, numero_factura_normalizado, fecha_emision, moneda, importe_base_total, importe_impuestos_total, importe_retencion_total, importe_total, observaciones
- Cabecera fila 2: valores de cabecera
- Fila 3 (líneas): descripcion, codigo_producto, cantidad, precio_unitario, porcentaje_iva, importe_base, importe_impuesto, importe_total_linea
- Filas 4..N: valores de líneas
- Nombre de hoja: `numero_factura_normalizado`

## Ubicación y sobrescritura
- Prefijo derivado de `r2_pdf_key`; el XLSX se escribe en la misma carpeta que el PDF
- Política: sobrescribe si existe

## Actualización D1
- `fat_facturas_archivos` upsert por `invoiceId` (error si factura_id no coincide)
- Campos poblados: factura_id, invoiceId, r2_pdf_key, original_file_name, file_url, estado_validacion, r2_excel_key

## Errores y bloqueos
- Errores del paso generan `error_validacion_factura.json` con `origen=excel_fat_empresas` y detienen workflow
- Inconsistencia invoiceId/factura_id en `fat_facturas_archivos` detiene el flujo
