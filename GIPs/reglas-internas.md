# Reglas internas (wf-procesar-factura)

1) Respuestas de OpenAI
- `apioResponse.output` llega como array: extraer JSON desde `output[0].content[0].text` y parsear antes de validar.
- El template de prompt usa `{{ARCHIVO_URL}}` y no debe incluir la API key.

2) URL pública de R2
- Usar siempre el dominio proporcionado: `https://pub-4e5e6e57e45848fbbbec281180517b6e.r2.dev/{r2Key}`. No inventar subdominios ni derivarlos del bucket.

3) Mapeo de esquema OpenAI → RO esperado
- `datos_generales`: mapear `emisor_nombre`→`nombre_proveedor`, `emisor_nif`→`nif_proveedor` si vienen así. Completar faltantes con defaults: `importe_retencion_total=0`, `observaciones=""`.
- `lineas`: asegurar `codigo_producto` (string) y `porcentaje_iva` (number) tengan valores (usar "" y 0 si faltan).
- El schema actual obligatorio incluye: nombre_proveedor, nif_proveedor, fecha_emision, moneda, importe_base_total, importe_impuestos_total, importe_retencion_total, importe_total, observaciones; y en líneas: descripcion, codigo_producto, cantidad, precio_unitario, porcentaje_iva, importe_base, importe_impuesto, importe_total_linea.

4) Prompt/JSON Schema
- Usar el nuevo schema (con campos anteriores) en `facturas-extraer-texto`. El campo `codigo_producto` es string. Mantener `strict: true` solo si la API lo permite; si devuelve `Unknown parameter: 'strict'`, eliminar `strict` del prompt.

5) Persistencia en D1
- SQL con parámetros debe usar `.bind(...).all()` (o array) en D1. Nunca pasar params directamente a `.all()`.
- Columnas existentes: `fat_empresas(nif_proveedor, nombre_proveedor, nombre_normalizado, ...)`. Consultas/insert deben usar esos nombres exactos.

6) Flujo de R2
- Descargar PDF desde `fileUrl` recibido, subir a R2 con `r2Key`, y pasar a OpenAI la URL pública de R2.

7) No romper lo que funciona
- No revertir los mappings ni los defaults anteriores; no cambiar dominios de R2; no quitar la extracción del JSON anidado.
