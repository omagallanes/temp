# Checklist auditoría: paso proveedor_fat_empresas (2026-01-14 17:00)

## Entradas esperadas
- `ro.datos_generales.nif_proveedor`: texto utilizable, no vacío, sin recorte ni alteración previa.
- `ro.datos_generales.nombre_proveedor`: texto utilizable, no vacío, sin recorte ni alteración previa.
- `metadatos`: `invoiceId`, `r2_pdf_key`, `file_url`, `nombre_original`, `contentType` como textos utilizables.

## Salidas esperadas
- Éxito: objeto con `empresaId` (fat_empresas.id), `ro` sin cambios, `metadatos` sin cambios.
- Error: se crea `error_validacion_factura.json` en la misma ruta del PDF en R2, se detiene el workflow.

## Casos de éxito
- Proveedor existe (nif único): se devuelve `empresaId` existente, no se genera fichero de error.
- Proveedor no existe: se normaliza `nombre_proveedor` → `nombre_normalizado` (regla explícita abajo), se inserta en `fat_empresas`, se devuelve nuevo `empresaId`.

## Casos de error (regla de parada)
- Entrada mínima ausente o vacía (`nif_proveedor`, `nombre_proveedor`, campos de `metadatos`).
- `nombre_normalizado` queda vacío tras normalización.
- Duplicidad en `fat_empresas` (más de una fila para el mismo NIF).
- Fallo de consulta/insert (incluye restricciones no documentadas como `correo_e` NOT NULL).
- Indisponibilidad de base de datos D1.

## Decisiones tomadas
- Normalización de `nombre_proveedor` para `nombre_normalizado`:
  - minúsculas;
  - eliminar espacios;
  - eliminar puntuación (puntos, comas, guiones, barras, paréntesis, signos comunes);
  - eliminar diacríticos (á→a, é→e, í→i, ó→o, ú/ü→u, ñ→n);
  - resultado solo puede contener [a-z0-9]; cualquier otro carácter se elimina;
  - si queda vacío → error controlado.
- `origen` en errores de este paso: literal `proveedor_fat_empresas`.
- No se modifica `nif_proveedor` ni `nombre_proveedor` originales.

## Bloqueos / riesgos conocidos
- Esquema de `fat_empresas` podría exigir `correo_e` NOT NULL; si ocurre, se produce error controlado y se debe ajustar el esquema (no se inventan correos).
- Compatibilidad D1: se usa `INSERT ... RETURNING id`; si no estuviera habilitado, se intenta `last_insert_rowid()` como respaldo.
- Se requiere binding `DB_FAT_EMPRESAS` en `wrangler.toml` y `Env`.

## Verificaciones pendientes
- Probar contra base D1 real con esquema actual (validar restricciones y tipos).
- Confirmar que el índice único sobre `nif_proveedor` existe para garantizar unicidad.
