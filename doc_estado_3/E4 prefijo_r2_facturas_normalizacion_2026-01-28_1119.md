# Normalización de prefijo R2 para facturas (documentación funcional)

Fecha: 2026-01-28 11:19
Ámbito: Solo documentación. No se modifica código. Mantener compatibilidad con el Worker Fetch/HTTP en producción y el frontal en Pages.

## 1. Estado actual de rutas R2 (observado en código)
- Ingesta HTTP (frontal → Worker Fetch): el payload incluye `r2Key`; se usa tal cual en Workflow P1 para guardar el PDF en R2. El patrón depende de lo que envíe el frontal; no se fuerza prefijo en código.
- Ingesta email (Worker email): clave R2 construida como `email/<invoiceId>/<archivo>` al subir el adjunto a R2; URL pública: `https://pub-4e5e6e57e45848fbbbec281180517b6e.r2.dev/<r2Key>`.
- Artefactos Workflow (derivados IA): `facturas/<invoiceId>/facturas-extraer-texto.json` (éxito) y `facturas/<invoiceId>/facturas-extraer-texto-ERROR_<timestamp>.json` + `error_validacion_factura.json` relativo al PDF.
- Artefactos Workflow (Excel): `<prefijoDelPdf>/<nombreProveedorNormalizado>_<numeroFacturaNormalizado>.xlsx`, donde `<prefijoDelPdf>` es el path base del PDF ya cargado (mantiene subcarpeta).
- Componentes vistos: prefijo histórico `email/` para ingesta correo; componente `facturas/` para resultados de IA y errores; Excel usa base del PDF (puede arrastrar `email/` si la ingesta fue por correo).

## 2. Regla funcional de prefijo único
- Norma: todos los archivos de facturas en R2 deben ubicarse bajo el prefijo lógico `R2_FACTURAS_PREFIX`, valor funcional acordado: "facturas".
- Aplica a cualquier origen (correo o interfaz web). El origen no debe reflejarse en el prefijo, solo en metadatos, subrutas o base de datos.
- El contrato Fetch/HTTP actual no se altera; cualquier transición debe preservarlo.

## 3. Estructura objetivo de rutas bajo `facturas`
- Base: `facturas/` (valor de `R2_FACTURAS_PREFIX`).
- Inclusión de `invoiceId` como eje de trazabilidad: `facturas/<invoiceId>/...`.
- Subcomponentes por tipo de artefacto (conceptual):
  - Original: `facturas/<invoiceId>/original/<nombreArchivo>`.
  - Derivado IA (JSON): `facturas/<invoiceId>/ia/facturas-extraer-texto.json` (+ variantes de error con timestamp si aplica).
  - Excel: `facturas/<invoiceId>/excel/<nombreProveedorNormalizado>_<numeroFacturaNormalizado>.xlsx`.
  - Otros futuros: `facturas/<invoiceId>/...` según necesidad, manteniendo el mismo prefijo y `invoiceId`.
- Sin codificar origen en el prefijo; el invoiceId y subcarpetas indican el rol del archivo.

## 4. Discrepancias actuales vs. estructura objetivo
- Prefijo `email/` en ingesta por correo: no cumple la regla de prefijo único `facturas/`; arrastra el prefijo a Excels derivados.
- Payload HTTP puede aportar `r2Key` sin `facturas/`; depende del frontal, no garantizado que cumpla la norma.
- Artefactos IA ya usan `facturas/<invoiceId>/...`, alineados parcialmente con el objetivo.
- Implicaciones: coexistencia de rutas con prefijos distintos complica localización y migración; Excel hereda el prefijo del PDF original.

## 5. Relación con Cloudflare KV (`R2_FACTURAS_PREFIX`)
- `R2_FACTURAS_PREFIX` se define como fuente de verdad para el prefijo lógico (valor acordado "facturas").
- Diseño futuro: el código deberá leer `R2_FACTURAS_PREFIX` para componer claves R2; no deben quedar literales de prefijo alternativos.
- Prefijos históricos (p. ej., `email/`) deberán tratarse en un plan de migración/compatibilidad, no como prefijo objetivo.

## 6. Dependencias de confirmación externa
- Verificar en producción qué prefijos están en uso en R2 para: PDFs originales, JSON de IA, Excels (distinguiendo ingesta HTTP vs. email).
- Identificar datos históricos bajo prefijos distintos (`email/`, otros) y definir estrategia de conservación o migración.
- Confirmar que `R2_FACTURAS_PREFIX` en KV de producción tenga valor "facturas" y anotar fecha/entorno cuando se establezca.

## 7. Recordatorio de compatibilidad
- Ningún cambio operativo debe romper el contrato del Worker Fetch/HTTP en producción ni el frontal en Pages. Las futuras adaptaciones al prefijo único deben ser compatibles con rutas existentes mientras se migra.
