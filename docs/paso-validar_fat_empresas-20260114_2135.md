# Checklist auditoría: validar_fat_empresas (2026-01-14 21:35)

## Entradas
- `ro`, `metadatos` (invoiceId, r2_pdf_key, file_url, nombre_original, contentType)
- `empresaId`, `facturaId`, `lineasInsertadas`, `numeroFacturaNormalizado`, `nombreNormalizadoProveedor`

## Salidas (éxito)
- Propaga sin cambios: `ro`, `metadatos`, `empresaId`, `facturaId`, `lineasInsertadas`, `numeroFacturaNormalizado`, `nombreNormalizadoProveedor`
- Indicador: `validacionOk: true`

## Campos verificados y tolerancia
- Campos: base, impuestos, total
- Esperado: importes de `fat_facturas`
- Calculado: sumas de `fat_factura_lineas`
- Diferencia definida como `calculado - esperado` (positiva si líneas > cabecera)
- Tolerancia: |diferencia| ≤ 0,10 en cada campo
- Sin redondeo previo; valores se guardan tal cual en el JSON

## Casos de éxito
- Todas las diferencias dentro de ±0,10 → retorna éxito y continúa el workflow.

## Casos de discordancia (regla de parada)
- Alguna diferencia con |diferencia| > 0,10 → se genera `diferencia_validacion_factura.json` con claves: `campos_verificados`, `esperado`, `calculado`, `diferencias`, `tolerancia`; `origen=validar_fat_empresas`; se detiene el flujo.

## Casos de error de proceso/código
- Faltan registros en cabecera o líneas, o fallo de consulta → se genera `error_validacion_factura.json` (origen=validar_fat_empresas) y se detiene el flujo.

## Confirmaciones
- No se inserta ni actualiza nada en base de datos en este paso.
- Se usa la palabra “diferencia” en el detalle de discordancia.
- Contratos de rutas R2 y contenido se mantienen según reglas internas.
