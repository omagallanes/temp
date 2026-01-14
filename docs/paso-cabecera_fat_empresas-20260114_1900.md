# Checklist paso `cabecera_fat_empresas` (2026-01-14 19:00)

## Entradas
- `ro` (de `lectura-apioresponse`), incluye `datos_generales.numero_factura` y resto de campos obligatorios.
- `metadatos`: invoiceId, r2_pdf_key, file_url, nombre_original, contentType.
- `empresaId` (id en `fat_empresas`).

## Salidas
- `facturaId` (id en `fat_facturas`).
- `numeroFacturaNormalizado`.
- Passthrough: `ro`, `metadatos`, `empresaId`.

## Validaciones mínimas
- `numero_factura` texto utilizable, no vacío.
- Normalización `numero_factura_normalizado` (sin acentos, minúsculas, sin espacios/puntuación, solo alfanumérico); error si queda vacío.
- Resto de campos de `datos_generales` presentes y persistibles (sin revalidar todo el RO, solo mínimos para insertar).

## Reglas de negocio
- Unicidad: no existe factura con `(emisor_id = empresaId, numero_factura = ro.datos_generales.numero_factura)`.
- Insert en `fat_facturas` con: emisor_id, numero_factura, numero_factura_normalizado, fecha_emision, moneda, importe_base_total, importe_impuestos_total, importe_retencion_total, importe_total, observaciones.

## Errores
- Cualquier fallo (dato no utilizable, normalización vacía, duplicado, error D1) → `error_validacion_factura.json` en R2 (`origen = cabecera_fat_empresas`) y stop workflow.

## Casos de éxito
- Sin duplicado y datos válidos → inserta cabecera, devuelve `facturaId`, continúa flujo siguiente.

## Bloqueos detectados
- Confirmar prompt en KV sin `strict` si la API lo rechaza (no bloqueante para este paso).
- Mantener dominio R2 fijo `https://pub-4e5e6e57e45848fbbbec281180517b6e.r2.dev/{r2Key}`.
