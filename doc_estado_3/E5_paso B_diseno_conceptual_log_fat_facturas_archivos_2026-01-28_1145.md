# Diseño conceptual del campo `log` en `fat_facturas_archivos`

Fecha: 2026-01-28 11:45
Ámbito: definición funcional del `log` como historial del proceso de cada archivo de factura. Sin cambios de código ni de contratos. Compatible con Worker Fetch/HTTP en producción y el frontal en Pages.

## 1. Finalidad funcional
- El `log` actúa como historial estructurado de eventos significativos del proceso de una factura (por `invoiceId` ↔ `factura_id`), complementario a los estados existentes (`pendiente`, `validada`) y a los registros técnicos fijos.
- Debe permitir entender, de forma autónoma, el recorrido funcional de un archivo (qué pasó, cuándo, y resultado), sin sustituir estados ni registros técnicos.

## 2. Qué es un evento de `log`
- Un hecho funcional relevante ocurrido durante el flujo del Workflow, asociado a un `invoiceId` y, cuando exista, a un `factura_id`.
- Incluye: fase del flujo, resultado (éxito/error/omitido), marcas temporales y contexto mínimo para trazabilidad.
- No recoge detalles de implementación (stacks, payloads internos) ni información redundante con estados persistidos.

## 3. Tipos de eventos (vinculados a fases reales del Workflow)
| Fase funcional (referencia E5) | Tipo de evento conceptual | Resultado esperado | Nota de contexto |
|---|---|---|---|
| Inicio (evento) | `inicio_caso` | Éxito | Recepción de payload con `invoiceId`, `r2Key`, `fileUrl`. |
| Extracción de texto (IA) | `extraccion_ia_ok` / `extraccion_ia_error` | Éxito o error temprano | Descarga y envío a OpenAI; en error se detiene el flujo. |
| Lectura/validación RO | `validacion_ro_ok` / `validacion_ro_error` | Éxito o error temprano | RO listo o error de estructura/parseo. |
| Resolución proveedor | `proveedor_ok` / `proveedor_error` | Éxito o error intermedio | `empresaId` resuelto o fallo D1/proveedor. |
| Cabecera de factura | `cabecera_ok` / `cabecera_error` | Éxito o error intermedio | `factura_id` emitido; en error, flujo se detiene. |
| Registro de archivo (pendiente) | `archivo_pendiente_ok` / `archivo_pendiente_error` | Éxito o error intermedio | Upsert inicial en `fat_facturas_archivos` con estado `pendiente`. |
| Líneas de factura | `lineas_ok` / `lineas_error` | Éxito o error intermedio | Inserción completa de líneas. |
| Generación de Excel | `excel_ok` / `excel_error` | Éxito o error final | Excel cargado y estado `validada` o error al generar/subir. |

## 4. Contexto mínimo por evento (conceptual, no formato técnico)
- Identificadores: `invoiceId`; `factura_id` cuando exista; `empresaId` cuando aplique.
- Fase / tipo de evento (de la tabla anterior).
- Resultado: éxito o tipo de error funcional (sin stack técnico).
- Timestamp del evento.
- Referencia de archivo cuando aplique (clave R2 implicada: PDF, JSON IA, Excel).
- Opcional: mensaje breve humano-legible (p.ej., motivo de validación fallida). No almacenar payloads completos.

## 5. Relación con estados y registros técnicos
- Estados existentes (`pendiente`, `validada`) siguen siendo la fuente del estado final del archivo; el `log` no los sustituye.
- El `log` debe reflejar el momento en que se alcanza un estado (p.ej., `archivo_pendiente_ok`, `excel_ok`), sin redefinir el estado.
- Registros técnicos fijos (“Facturas Fallidas”, “Sin Proveedor Identificado”): cuando se apliquen en el futuro, el `log` debe registrar el hecho de su uso (p.ej., asociación a `factura_id` técnico), pero el identificador vive en D1 y/o KV; no se replica en el `log` más allá de la referencia.

## 6. Qué NO debe reflejar el `log`
- No sustituye estados (`pendiente`/`validada`) ni crea estados nuevos.
- No almacena trazas técnicas profundas (stack traces, payloads completos, tokens, claves, prompts íntegros).
- No redefine contratos del Worker ni del Workflow; no registra variaciones de contrato HTTP.
- No duplica configuraciones de KV ni IDs técnicos; solo puede referenciar que se usaron.

## 7. Extensibilidad y compatibilidad
- El esquema conceptual admite nuevos tipos de eventos alineados con fases funcionales futuras, sin romper los existentes.
- Cualquier futura implementación debe ser compatible con el Worker Fetch/HTTP y el frontal en Pages, sin cambiar comportamientos actuales.
- Ambigüedades (p.ej., prefijos históricos en R2, valores KV aún no confirmados, IDs técnicos) se deben documentar, no asumir.

## 8. Referencias de entrada consideradas
- E1–E4 (contrato Worker, identificadores canónicos, configuración KV, prefijo R2) ya cerrados y respetados.
- Marco funcional limpio del Workflow (E5, fases reales y puntos críticos). Ninguna reinterpretación ni nuevo estado.

## 9. Notas finales de alcance
- Fase puramente conceptual y documental. No hay cambios en código, base de datos, Workflow ni Worker.
- Sirve como base para etapas siguientes (E6) donde se diseñará integración del `log` con estados y registros técnicos, siempre preservando el sistema en producción.
