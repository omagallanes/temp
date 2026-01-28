# Diseño conceptual de la notificación por correo al final del Workflow (E7)

Fecha: 2026-01-28 11:54
Ámbito: solo diseño funcional. Sin cambios de código ni de contratos. Compatible con Worker Fetch/HTTP en producción y frontal en Pages.

## 1. Momento de envío (fin de proceso)
- Punto de referencia: final del flujo actual (paso `excel_fat_empresas`), cuando el Workflow termina con éxito o lanza error final tras escribir el artefacto de error en R2.
- Candidatos a envío:
  - Éxito: cuando el estado en `fat_facturas_archivos` queda en `validada` tras generar y subir el Excel.
  - Fallo temprano: error en extracción IA o validación RO (antes de tocar D1).
  - Fallo intermedio: error en proveedor, cabecera, líneas o Excel (con `fat_facturas_archivos` posiblemente en `pendiente`).
  - Casos con registro técnico fijo: cuando se asocie a “Facturas Fallidas” o “Sin Proveedor Identificado” (según E6), si aplica en el futuro.

## 2. Resultados comunicables y decisión
- Resultado satisfactorio: estado final `validada` y eventos de log que muestran cadena completa hasta `excel_ok`.
- Fallo controlado con “Facturas Fallidas”: error que derive en uso del registro técnico fijo; log debe reflejar la asociación; estado puede quedar en `pendiente` o configurarse según política futura (no se redefine ahora).
- Fallo por ausencia de proveedor (“Sin Proveedor Identificado”): validación RO ok pero resolución de proveedor imposible y se asocia al registro técnico; log lo debe registrar; estado sin cambio adicional.
- Fallo no recuperable/incontrolado: cualquier error sin asociación a registro técnico fijo; estado no avanza a `validada`; log contiene evento de error relevante.
- Regla de decisión funcional (sin implementación):
  1) ¿Estado `validada`? → correo de éxito.
  2) Si no, ¿log indica asociación a registro técnico “Facturas Fallidas”? → correo de fallo controlado FF.
  3) Si no, ¿log indica asociación a “Sin Proveedor Identificado”? → correo de fallo por proveedor no identificado.
  4) En otro caso → correo de fallo no recuperable.

## 3. Datos mínimos del correo (por tipo de resultado)
- Comunes (trazabilidad mínima): `invoiceId`, `factura_id` si existe, estado final, timestamp de finalización, nombre original de archivo, referencia lógica en R2 (prefijo lógico `facturas` y `invoiceId`, sin rutas completas), resumen breve del resultado.
- Éxito: incluir estado `validada`, referencia al Excel generado (clave lógica), número de factura normalizado, proveedor resuelto (nombre/NIF), importe total si disponible del RO validado.
- Fallo con “Facturas Fallidas”: estado operativo (probablemente `pendiente`), causa principal del fallo, referencia a que se usó el registro técnico FF (sin exponer ID sensible; solo concepto), clave lógica del PDF en R2.
- Fallo “Sin Proveedor Identificado”: indicar que no se pudo resolver proveedor, referencia al registro técnico usado, clave lógica del PDF, resultado de validación previa (si RO válido).
- Fallo no recuperable: causa principal (mensaje funcional del log), clave lógica del PDF y, si existe, artefacto de error en R2.
- No incluir: tokens, prompts completos, stack traces, datos sensibles de KV o IDs internos sin necesidad.

## 4. Relación con log, estados y registros técnicos
- Estado determina el tipo base de resultado (éxito si `validada`; no éxito en otros casos).
- Eventos de log proveen la causa y el último hito (p.ej., `excel_error`, `lineas_error`, `validacion_ro_error`). Se seleccionan/resumen para el correo, no se envía el log completo.
- Registros técnicos fijos: si se usan, el log debe tener el evento de asociación; el correo menciona el concepto (FF o SPI) sin detallar IDs.

## 5. Destinatarios y variaciones (conceptual)
- Destinatarios primarios: rol operativo/soporte definido por negocio (pendiente de confirmación externa). Puede variar por tipo de resultado:
  - Éxito: destinatarios estándar (operación/finanzas) si se requiere confirmación.
  - Fallos: destinatarios de soporte/ops; si hay registro técnico FF o SPI, podría incluir al responsable de datos maestros/proveedores.
- Variaciones de contenido: énfasis en causa y acción requerida en fallos; en éxito, énfasis en disponibilidad de Excel y trazabilidad.
- Pendiente de confirmación: listas reales de correo y reglas de segmentación (no se asumen).

## 6. Idempotencia funcional
- Regla: un correo por proceso finalizado (por `invoiceId` y, cuando exista, `factura_id`).
- Reintentos/reprocesos: si se vuelve a ejecutar el flujo para el mismo `invoiceId`/`factura_id`, solo debe comunicarse el último resultado consolidado. Si se envía nuevamente, debe indicarse que corresponde a un reproceso más reciente (concepto, no implementación).
- Evitar duplicados: basarse en estado final y último evento de log al cerrar el flujo; no enviar múltiples correos por el mismo resultado.

## 7. Datos necesarios y origen conceptual
- Estado final en `fat_facturas_archivos` (pendiente/validada).
- Eventos relevantes del log (último evento y, si aplica, asociación a registros técnicos).
- Identificadores: `invoiceId` (siempre), `factura_id` (cuando exista), número de factura normalizado, proveedor normalizado (si resuelto).
- Referencia lógica en R2: prefijo `facturas`, `invoiceId`, tipo de artefacto (PDF/Excel/JSON IA). No usar URLs técnicas completas en el correo; solo claves lógicas.
- Concepto de registro técnico usado (FF o SPI) si aplica.

## 8. Qué NO hacer
- No alterar contratos ni secuencias del Workflow o Worker.
- No introducir estados nuevos ni registros técnicos adicionales.
- No exponer datos sensibles (tokens, prompts, stack traces, claves KV, IDs internos). El correo es informativo y operativo, no de depuración.
- No enviar el log completo ni repetir información ya expresada por el estado final.

## 9. Compatibilidad y pendientes
- Compatible con el estado actual en producción; ningún cambio se aplica aún.
- Pendiente: confirmar destinatarios, políticas de envío por entorno, valores efectivos de registros técnicos y prefijos en KV/R2. Estos deberán documentarse antes de implementar.
