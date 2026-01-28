# Plan técnico E8 – Ajustes internos (sin implementación)

Fecha: 2026-01-28 12:05
Ámbito: planificación estructurada para introducir log, lectura de configuración KV, prefijo único R2 y notificación final. Sin cambios de contrato HTTP ni frontal Pages. Solo plan; no código.

## 1. Componentes y archivos implicados
- Worker Fetch/HTTP y email: [workers/wf-procesar-factura/src/index.ts](workers/wf-procesar-factura/src/index.ts)
- Construcción de claves/URLs R2: [workers/wf-procesar-factura/src/lib/storage.ts](workers/wf-procesar-factura/src/lib/storage.ts)
- Acceso a KV/secretos para OpenAI: [workers/wf-procesar-factura/src/lib/openai.ts](workers/wf-procesar-factura/src/lib/openai.ts)
- Upsert de metadatos de archivo (estado pendiente/validada): [workers/wf-procesar-factura/src/lib/archivos.ts](workers/wf-procesar-factura/src/lib/archivos.ts)
- Librerías de negocio: cabecera, líneas, Excel en [workers/wf-procesar-factura/src/lib](workers/wf-procesar-factura/src/lib)
- Workflow orquestador (puntos de inserción de log/estado/notificación): [workers/wf-procesar-factura/src/workflow.ts](workers/wf-procesar-factura/src/workflow.ts)
- Binding de entornos (incluye KV y R2): [workers/wf-procesar-factura/src/types/env.ts](workers/wf-procesar-factura/src/types/env.ts)

## 2. Puntos del flujo para log, estado y notificación
| Fase funcional | Evento de log (E5) | Cambio de estado | Notificación (E7) | Nota |
|---|---|---|---|---|
| Inicio Workflow | inicio_caso | N/A | No | Tras recibir payload en workflow.run |
| Descarga + IA | extraccion_ia_ok / extraccion_ia_error | N/A | No | Usa KV OPENAI y plantilla |
| Validación RO | validacion_ro_ok / validacion_ro_error | N/A | No | Error temprano |
| Resolución proveedor | proveedor_ok / proveedor_error | N/A | No | Puede activar registro técnico SPI si se adopta |
| Cabecera factura | cabecera_ok / cabecera_error | N/A | No | Genera factura_id |
| Upsert archivo pendiente | archivo_pendiente_ok / archivo_pendiente_error | Estado → pendiente | No | Upsert en fat_facturas_archivos |
| Líneas factura | lineas_ok / lineas_error | N/A | No | Inserción masiva |
| Excel y cierre | excel_ok / excel_error | Estado → validada (solo ok) | Sí, solo en cierre (éxito o error final) | Punto de disparo de notificación |
| Asociación a registro técnico (FF/SPI) | evento de asociación (conceptual) | Estado puede quedar en pendiente | Sí, si el cierre es un fallo controlado | Requiere IDs confirmados |

## 3. Lecturas KV previstas (fuente de verdad)
- Worker (entrada Fetch/email): R2_FACTURAS_PREFIX para normalizar prefijo lógico en ingesta y en claves derivadas; configuración de correo (remitente/destinatarios/política) si se define; no cambia contrato HTTP.
- Workflow: OPENAI_API_KEY y plantilla facturas-extraer-texto (actual); R2_FACTURAS_PREFIX para rutas de artefactos; SIN_PROVEEDOR_EMPRESA_ID y FACTURAS_FALLIDAS_FACTURA_ID cuando se necesite asociar registros técnicos; parámetros de notificación (conceptuales) si se pasan vía binding/config.
- Ruta de prueba SheetJS: SHEETJS_TEST_TOKEN (sin cambio, ámbito de prueba).

## 4. Ajustes previstos en R2 (prefijo único, sin compatibilidad histórica)
- Prefijo objetivo: `facturas` (R2_FACTURAS_PREFIX) para todos los artefactos nuevos (PDF, JSON IA, Excel).
- Ingesta email: normalizar para que escriba bajo `facturas/<invoiceId>/original/...` en lugar de `email/<invoiceId>/...`.
- Construcción de artefactos IA y Excel: asegurar que usan el prefijo lógico, no literales de host ni subprefijos históricos.
- Compatibilidad histórica: no se mantiene lectura dual ni rutas antiguas; los artefactos previos en R2 se consideran prescindibles y pueden limpiarse fuera de este plan.

## 5. Dependencias externas a confirmar antes de implementar
- Valores efectivos en KV de producción: R2_FACTURAS_PREFIX, SIN_PROVEEDOR_EMPRESA_ID, FACTURAS_FALLIDAS_FACTURA_ID, configuración de correo.
- Existencia y validez de registros técnicos en D1: IDs reales para “Sin Proveedor Identificado” y “Facturas Fallidas”.
- Servicio de correo y política de envío (dominio, remitente, destinatarios por tipo de resultado, entorno).
- Volumen esperado de eventos de log para dimensionar límite razonable del JSON (aunque no se espera alto volumen).

## 6. Riesgos técnicos y mitigación
- Prefijo R2 mal configurado: depender de R2_FACTURAS_PREFIX leído desde KV y validar en entornos previos; no existe respaldo por rutas históricas.
- Duplicidad de notificaciones: aplicar idempotencia basada en estado final + último evento de log; enviar solo en cierre.
- Crecimiento del log: limitar a eventos de E5, política append-only acotada; monitorear tamaño del JSON.
- Valores KV no presentes: implementar validaciones previas y fallback seguro (detener con error controlado sin afectar contrato HTTP).

## 7. Decisiones sobre Further Considerations (cerradas en E8)
- Registro del log: Columna JSON en fat_facturas_archivos (opción A). Append-only lógico, solo eventos E5, no orientado a analítica masiva. Tabla hija se descarta; no se difiere.
- Notificación por correo: Solo en cierre funcional (estado validada o error final, con o sin registros técnicos). Nunca en pasos intermedios ni en cada intento.
- Prefijos en R2: Sin compatibilidad histórica; no habrá lectura dual ni alias. Todos los artefactos nuevos usarán el prefijo lógico único desde KV; la limpieza de artefactos previos es posible y queda fuera de este plan.

## 8. Próximos entregables (E9+)
- Definir GIP de implementación incremental por lotes: (1) KV/prefijo, (2) log append-only, (3) disparo de notificación, (4) hardening de compatibilidad R2.
- Validar con negocio la matriz de destinatarios y política de entornos para correo.
- Confirmar valores KV y existencia de registros técnicos en producción antes de tocar código.
