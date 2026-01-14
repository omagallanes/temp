# Checklist auditoría: idempotencia cabecera_fat_empresas (2026-01-14 21:00)

## Qué cambió
- La detección de duplicados pasó de error a reutilización: si ya existe factura para `(emisor_id, numero_factura)`, se reutiliza su `facturaId` y el workflow continúa.
- Se mantiene la inserción cuando no existe y la normalización de `numero_factura`.
- No se implementó actualización de cabecera al reutilizar; queda pendiente de regla explícita.

## Casos contemplados
- Factura no existe: se inserta en `fat_facturas` y se devuelve nuevo `facturaId`.
- Factura existe: se devuelve `facturaId` existente sin error por duplicado.
- Error de base de datos o validación: se genera `error_validacion_factura.json` con `origen=cabecera_fat_empresas` y se detiene el flujo.

## Impacto en pasos posteriores
- El paso de líneas borra e inserta por `facturaId`; al reutilizar `facturaId`, las líneas se reemplazarán sobre la misma factura en reintentos.

## Actualización opcional
- No hay regla explícita para actualizar cabecera existente; no se actualiza. Extensión futura pendiente de decisión.

## Riesgos / pendientes
- Si existen múltiples filas para la misma pareja `(emisor_id, numero_factura)`, se lanza error controlado de duplicado.
- Validar en entorno real que el esquema respeta la unicidad lógica y que la selección retorna a lo sumo una fila.
