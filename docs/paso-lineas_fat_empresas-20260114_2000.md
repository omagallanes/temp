# Checklist auditoría: paso lineas_fat_empresas (2026-01-14 20:00)

## Entradas esperadas
- `facturaId`: id numérico existente en `fat_facturas`.
- `empresaId`: id numérico existente en `fat_empresas`.
- `numero_factura_normalizado`: texto utilizable (salida previa de cabecera).
- `ro.lineas`: array con al menos un elemento.
- Cada línea debe traer: `descripcion` (string), `codigo_producto` (string, permite vacío), `cantidad`, `precio_unitario`, `porcentaje_iva`, `importe_base`, `importe_impuesto`, `importe_total_linea` (todos numéricos).
- `metadatos` con `invoiceId`, `r2_pdf_key`, `file_url`, `nombre_original`, `contentType` como textos utilizable.

## Salidas esperadas
- Éxito: objeto con `lineasInsertadas` (conteo), `facturaId`, `numeroFacturaNormalizado`, `empresaId`, `ro`, `metadatos`.
- Error: se crea `error_validacion_factura.json` en la misma ruta del PDF en R2, se detiene el workflow.

## Casos de éxito
- Se borran primero las líneas existentes de la factura (`DELETE`), luego se insertan todas las nuevas con `orden` incremental desde 1.
- Se respeta `codigo_producto` aunque venga vacío (se inserta `null` cuando no llega).

## Casos de error (regla de parada)
- `lineas` no es array o está vacío.
- Campos faltantes o inválidos en alguna línea.
- Error al borrar o insertar en D1 (incluye restricciones no documentadas).
- Indisponibilidad de base de datos D1.

## Decisiones tomadas
- `origen` en errores de este paso: literal `lineas_fat_empresas`.
- `codigo_producto` se inserta como `null` cuando no viene.
- No se continúa si falla cualquier línea; se aborta con error controlado.

## Bloqueos / riesgos conocidos
- Esquema D1 puede tener restricciones adicionales; cualquier fallo se propaga como error controlado.
- Si la tabla de líneas no acepta `null` en `codigo_producto`, se deberá ajustar el esquema; no se inventan valores.

## Verificaciones pendientes
- Probar contra la base D1 real con facturas que ya tengan líneas para verificar borrado + inserción.
- Confirmar que el índice/PK permite `orden` creciente por factura sin restricciones adicionales.
