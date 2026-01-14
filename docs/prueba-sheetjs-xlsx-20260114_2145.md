# Checklist: prueba mínima SheetJS en Workers (2026-01-14 21:45)

## Alcance de la prueba
- Generar XLSX en el Worker usando SheetJS y subirlo a R2.
- Datos reales: lectura limitada desde `fat_factura_lineas` en D1.
- Sin despliegue previsto en este ejercicio.

## Dependencia incorporada
- Paquete: `xlsx@0.18.5`
- Uso: módulo `src/lib/xlsx.ts` genera el libro/hoja y devuelve `Uint8Array`.
- Impacto esperado: aumenta el bundle; revisar al empaquetar con Wrangler si hay advertencias de tamaño (no medido aquí).

## Ruta de prueba (temporal, protegida)
- Endpoint: `GET /prueba-sheetjs`
- Protección: token requerido en cabecera `x-test-token` o query `token`; se compara con `SHEETJS_TEST_TOKEN` en `NSKV_SECRETOS`.
- Comportamiento:
  - Selecciona hasta 10 filas de `fat_factura_lineas`.
  - Genera XLSX con columnas: factura_id, descripcion, cantidad, precio_unitario, porcentaje_iva, importe_base, importe_impuesto, importe_total_linea.
  - Sube a R2 con `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
  - Clave R2: `pruebas/xlsx/prueba_sheetjs.xlsx`.
- Para deshabilitar: retirar el token de `NSKV_SECRETOS` o eliminar la ruta temporal.

## Resultados esperados
- Éxito: respuesta JSON `{ ok: true, key: "pruebas/xlsx/prueba_sheetjs.xlsx" }` y archivo abrible en Excel desde R2.
- Fallo: respuesta 4xx si falta token; 404 si no hay datos de prueba; 500 ante errores de consulta o generación.

## Notas y limitaciones
- Workers carece de `fs`/`Buffer`; se usa `ArrayBuffer/Uint8Array` con SheetJS `write(type:"array")`.
- La prueba es mínima (una hoja, pocas filas) y no sustituye el paso 6 de exportación.
- Se recomienda retirar la ruta tras la validación para evitar exposición en producción.
