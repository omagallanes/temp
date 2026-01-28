# Configuración centralizada del flujo de facturas (documentación actual)

Fecha: 2026-01-28 11:18
Ámbito: Cloudflare Worker (Fetch/HTTP en producción), Cloudflare Workflow, D1, R2, KV. No se modificó código. Mantener compatibilidad total con el frontal Pages y el punto de entrada Fetch.

## 1. Claves de Cloudflare KV relevantes
| Clave KV | Propósito funcional | Tipo de valor esperado | Relación con D1 / R2 / otros |
|---|---|---|---|
| OPENAI_API_KEY | Token para invocar OpenAI en el paso `wf-facturas-extraer-texto` del Workflow. | Texto (secreto). | Consumida por Workflow para `callOpenAI`; no se almacena en D1. |
| facturas-extraer-texto (plantilla prompt) | Plantilla JSON para la llamada a OpenAI, con marcador `{{ARCHIVO_URL}}`. | Texto (JSON serializado). | Usada por Workflow para construir la petición; sin relación directa con D1/R2. |
| SHEETJS_TEST_TOKEN | Token de autorización para ruta de prueba `GET /prueba-sheetjs` del Worker. | Texto (token). | Ruta de prueba lee de KV y escribe XLSX en R2; lee `fat_factura_lineas` en D1. |
| R2_FACTURAS_PREFIX | Prefijo lógico para objetos de facturas en R2. (No usado en código actual.) | Texto (prefijo, se espera "facturas"). | Debe alinearse con rutas efectivas en R2 para PDFs, JSON de OpenAI y Excels. |
| SIN_PROVEEDOR_EMPRESA_ID | Identificador técnico en `fat_empresas` para "Sin Proveedor Identificado". (No usado en código actual.) | Entero (ID existente en D1). | Se usará para asociar facturas sin proveedor real; debe existir en D1. |
| FACTURAS_FALLIDAS_FACTURA_ID | Identificador técnico en `fat_facturas` para "Facturas Fallidas". (No usado en código actual.) | Entero (ID existente en D1). | Se usará para registrar facturas fallidas; debe existir en D1 y relacionarse con archivos en `fat_facturas_archivos`. |

## 2. Relación KV ↔ registros técnicos en D1
- SIN_PROVEEDOR_EMPRESA_ID: valor debe corresponder a un registro técnico real en `fat_empresas` que represente "Sin Proveedor Identificado". Uso futuro: asociar facturas cuando no se resuelva proveedor. Requiere confirmar existencia en D1 producción antes de usar.
- FACTURAS_FALLIDAS_FACTURA_ID: valor debe corresponder a un registro técnico real en `fat_facturas` para "Facturas Fallidas". Uso futuro: referenciar facturas fallidas y sus archivos en `fat_facturas_archivos`. Requiere confirmación en D1 producción.
- Espacio reservado: cuando se verifiquen los IDs reales en producción, registrar los valores confirmados en este documento para trazabilidad. Hasta entonces, el código no los consume; cualquier cambio debe mantener operativo el Fetch/HTTP actual.

## 3. Relación KV ↔ prefijo R2
- R2_FACTURAS_PREFIX: prefijo lógico acordado: "facturas". Objetivo: unificar claves en R2 para:
  - Archivos originales PDF (`.../<invoiceId>/<archivo>.pdf`).
  - Artefactos de IA (JSON de OpenAI): `facturas/<invoiceId>/facturas-extraer-texto.json` y variantes de error.
  - Excels generados: `.../<nombreProveedor>_<numeroFactura>.xlsx` bajo el mismo árbol.
- Situación actual: el código usa URL pública fija `https://pub-4e5e6e57e45848fbbbec281180517b6e.r2.dev/` y construye claves sin leer `R2_FACTURAS_PREFIX`. En etapas posteriores, alinear rutas reales y prefijos históricos con el valor de KV sin romper el comportamiento del Fetch/HTTP en producción.

## 4. Inventario de claves y literales usados en código
| Literal / clave | Dónde se usa | Respaldo KV hoy | Función en el flujo |
|---|---|---|---|
| OPENAI_API_KEY | Workflow paso P1 (`wf-facturas-extraer-texto`) | Sí (NSKV_SECRETOS) | Autenticación OpenAI. |
| facturas-extraer-texto (plantilla) | Workflow paso P1 | Sí (NSKV_PROMPTS) | Cuerpo de petición a OpenAI. |
| SHEETJS_TEST_TOKEN | Ruta `GET /prueba-sheetjs` del Worker | Sí (NSKV_SECRETOS) | Control de acceso a ruta de prueba. |
| `https://pub-4e5e6e57e45848fbbbec281180517b6e.r2.dev/` | Worker (email) y Workflow (P1) | No | Base pública de R2 para construir URLs de archivos. |
| Estado `pendiente` | Workflow paso `fat_facturas_archivos` (primer upsert) | No | Marca metadatos antes de validar/generar Excel. |
| Estado `validada` | Workflow paso `excel_fat_empresas` (segundo upsert) | No | Marca metadatos tras generar Excel. |
| MIME `application/pdf` | Selección de adjunto en email Worker | No | Filtra adjunto principal. |
| Prefijo `email/` + `<invoiceId>/` | Clave R2 al recibir por email | No | Ubicación del PDF entrante vía correo. |
| `facturas/<invoiceId>/facturas-extraer-texto.json` | Persistencia de respuesta OpenAI | No | Artefacto de extracción de texto en R2. |
| `error_validacion_factura.json` (ruta relativa al PDF) | Errores de validación en Workflow | No | Registro de errores por invoiceId. |

## 5. Dependencias sujetas a confirmación externa
- Confirmar en Cloudflare KV (producción) los valores actuales de: `R2_FACTURAS_PREFIX`, `SIN_PROVEEDOR_EMPRESA_ID`, `FACTURAS_FALLIDAS_FACTURA_ID` y documentarlos aquí. El código actual no los lee; cualquier futura lectura debe mantener intacto el contrato Fetch/HTTP.
- Verificar en D1 producción la existencia y contenido de los registros técnicos para "Sin Proveedor Identificado" (`fat_empresas`) y "Facturas Fallidas" (`fat_facturas`); registrar IDs confirmados en este documento.
- Revisar prefijos y rutas efectivas en R2 actualmente en uso (PDFs, JSON de IA, Excels) y alinearlos con `R2_FACTURAS_PREFIX` cuando se adopte, sin romper la ruta pública usada por el frontal.

## 6. Recordatorio de compatibilidad
- Cualquier ajuste futuro deberá conservar el contrato HTTP del Worker (ruta POST principal, respuestas y validaciones) y la compatibilidad con el frontal en Cloudflare Pages que está en producción.
- Hasta que se integre la configuración KV adicional, los literales existentes siguen activos; los cambios deberán ser compatibles con ellos mientras se migra.
