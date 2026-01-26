1. Visión general del proyecto
- Tipo: Proyecto Cloudflare Workers con un único Worker HTTP y un único Workflow registrado.
- Componentes detectados: Worker `wf-procesar-factura` (script principal) y Workflow `ProcesarFacturaWorkflow`.

2. Estructura del proyecto (árbol)
```
.
├── README.md
├── archivos_archivo/
│   └── wf-procesar-factura/
│       ├── wf-procesar-factura.js
│       └── wf-procesar-factura.metadata.json
├── conexiones/
│   └── deploy/
│       └── ARCHIVE_NOTICE.md
├── docs/
│   ├── paso-cabecera_fat_empresas-20260114_1900.md
│   ├── paso-excel_fat_empresas-20260114_1700.md
│   ├── paso-lectura-apioresponse-20260114_1615.md
│   ├── paso-lineas_fat_empresas-20260114_2000.md
│   ├── paso-proveedor_fat_empresas-20260114_1700.md
│   ├── prueba-sheetjs-xlsx-20260114_2145.md
│   ├── wf-procesar-factura_files_2026-01-14_13-55-49.md
│   └── wf-procesar-factura_flow_2026-01-14_15-00-17.md
├── GIPs/
│   ├── p1_lectura-apioresponse.md
│   └── reglas-internas.md
├── Legado/
│   ├── 20260114_1358_wf-procesar-factura_CF.js
│   └── facturas-extraer-texto - 3.json
├── doc_estado/ (informes generados)
│   ├── estado_cfworkers_2026-01-25_0852.md
│   └── estructura_cfworkers_2026-01-25_1312.md  <-- este informe
├── workers/
│   └── wf-procesar-factura/
│       ├── README.md
│       ├── DESPLIEGUE-RESUMEN.md
│       ├── DEPLOYMENT.md
│       ├── deploy.sh
│       ├── package.json
│       ├── package-lock.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── wrangler.toml
│       ├── src/
│       │   ├── index.ts
│       │   ├── workflow.ts
│       │   ├── lib/
│       │   │   ├── apioresponse.ts
│       │   │   ├── archivos.ts
│       │   │   ├── cabecera.ts
│       │   │   ├── excel.ts
│       │   │   ├── lineas.ts
│       │   │   ├── openai.ts
│       │   │   ├── proveedor.ts
│       │   │   ├── storage.ts
│       │   │   └── xlsx.ts
│       │   └── types/
│       │       ├── env.d.ts
│       │       └── env.ts
│       ├── test/
│       │   ├── fetch.handler.test.ts
│       │   └── workflow.test.ts
│       └── node_modules/ (no expandido por volumen; presente según package-lock)
└── workers/wf-procesar-factura/dist/ (build generado, incluye index.js, mapas)
```

3. Inventario de archivos (tabla)
| Ruta | Tipo | Rol técnico | Componente Cloudflare relacionado |
| --- | --- | --- | --- |
| [workers/wf-procesar-factura/wrangler.toml](workers/wf-procesar-factura/wrangler.toml#L1-L27) | Configuración | Define script, main, bindings (KV, R2, D1, Workflow) | Worker y Workflow registrados |
| [workers/wf-procesar-factura/src/index.ts](workers/wf-procesar-factura/src/index.ts#L6-L29) | Entrypoint HTTP | Handler `fetch` que valida entrada y arranca Workflow; incluye ruta GET de prueba | Worker `wf-procesar-factura` |
| [workers/wf-procesar-factura/src/workflow.ts](workers/wf-procesar-factura/src/workflow.ts#L42-L426) | Entrypoint Workflow | Clase `ProcesarFacturaWorkflow` extiende `WorkflowEntrypoint`, método `run` | Workflow `ProcesarFacturaWorkflow` |
| [workers/wf-procesar-factura/src/types/env.ts](workers/wf-procesar-factura/src/types/env.ts#L1-L17) | Tipado | Define interfaz `Env` con bindings KV, R2, D1 y Workflow | Worker/Workflow (bindings) |
| [workers/wf-procesar-factura/src/lib/apioresponse.ts](workers/wf-procesar-factura/src/lib/apioresponse.ts) | Librería | Utilidades de validación y R2 para apioresponse | Usado por Workflow |
| [workers/wf-procesar-factura/src/lib/archivos.ts](workers/wf-procesar-factura/src/lib/archivos.ts) | Librería | Upsert de archivos en D1 | Usado por Workflow |
| [workers/wf-procesar-factura/src/lib/cabecera.ts](workers/wf-procesar-factura/src/lib/cabecera.ts) | Librería | Validación e inserción de cabecera de factura en D1 | Usado por Workflow |
| [workers/wf-procesar-factura/src/lib/excel.ts](workers/wf-procesar-factura/src/lib/excel.ts) | Librería | Construcción de Excel y subida a R2 | Usado por Workflow |
| [workers/wf-procesar-factura/src/lib/lineas.ts](workers/wf-procesar-factura/src/lib/lineas.ts) | Librería | Validación e inserción de líneas en D1 | Usado por Workflow |
| [workers/wf-procesar-factura/src/lib/openai.ts](workers/wf-procesar-factura/src/lib/openai.ts) | Librería | Llamadas OpenAI | Usado por Workflow |
| [workers/wf-procesar-factura/src/lib/proveedor.ts](workers/wf-procesar-factura/src/lib/proveedor.ts) | Librería | Resolución de proveedor | Usado por Workflow |
| [workers/wf-procesar-factura/src/lib/storage.ts](workers/wf-procesar-factura/src/lib/storage.ts) | Librería | Helpers KV y R2 | Usado por Workflow |
| [workers/wf-procesar-factura/src/lib/xlsx.ts](workers/wf-procesar-factura/src/lib/xlsx.ts) | Librería | Generación de XLSX de prueba | Usado por Worker (ruta GET) |
| [workers/wf-procesar-factura/test/fetch.handler.test.ts](workers/wf-procesar-factura/test/fetch.handler.test.ts) | Test | Pruebas de handler fetch | Worker |
| [workers/wf-procesar-factura/test/workflow.test.ts](workers/wf-procesar-factura/test/workflow.test.ts) | Test | Pruebas de Workflow | Workflow |
| [workers/wf-procesar-factura/deploy.sh](workers/wf-procesar-factura/deploy.sh) | Script | Despliegue (no entrypoint) | n/a |
| [archivos_archivo/wf-procesar-factura/wf-procesar-factura.js](archivos_archivo/wf-procesar-factura/wf-procesar-factura.js) | Historial | Versión archivada JS | n/a |
| [Legado/20260114_1358_wf-procesar-factura_CF.js](Legado/20260114_1358_wf-procesar-factura_CF.js) | Historial | Versión legada | n/a |

4. EntryPoints identificados (tabla)
| Tipo | Archivo | Método / Clase | Observaciones |
| --- | --- | --- | --- |
| HTTP | [workers/wf-procesar-factura/src/index.ts](workers/wf-procesar-factura/src/index.ts#L6-L29) | `fetch(request, env)` | Acepta POST genérico y GET `/prueba-sheetjs`; no scheduled handler |
| Workflow | [workers/wf-procesar-factura/src/workflow.ts](workers/wf-procesar-factura/src/workflow.ts#L42-L426) | Clase `ProcesarFacturaWorkflow` con método `run(event, step)` | Único Workflow registrado en wrangler |
| Scheduled | n/a | n/a | No se encontraron handlers `scheduled()` ni triggers cron |

5. Cloudflare Workflow – detalle estructural
| Elemento | Detalle |
| --- | --- |
| Archivo entrypoint | [workers/wf-procesar-factura/src/workflow.ts](workers/wf-procesar-factura/src/workflow.ts#L42-L426) |
| Clase `WorkflowEntrypoint` | `ProcesarFacturaWorkflow` |
| Método `run` | Procesa `event.payload` (invoiceId, fileUrl, r2Key, originalFileName, contentType) en pasos secuenciales (R2, KV, OpenAI, D1, Excel). |
| Archivos auxiliares usados | Librerías en [workers/wf-procesar-factura/src/lib](workers/wf-procesar-factura/src/lib) y tipos en [workers/wf-procesar-factura/src/types](workers/wf-procesar-factura/src/types). |
| Binding Workflow | Declarado como `WF_PROCESAR_FACTURA` en wrangler [workers/wf-procesar-factura/wrangler.toml](workers/wf-procesar-factura/wrangler.toml#L23-L27). |

Diagrama de flujo (Workflow y relaciones)
```mermaid
graph TD
  HTTP[Worker fetch POST] -->|env.WF_PROCESAR_FACTURA.create| WF[ProcesarFacturaWorkflow]
    WF --> R2[(R2_FACTURAS)]
      WF --> KV1[(NSKV_SECRETOS)]
        WF --> KV2[(NSKV_PROMPTS)]
          WF --> D1[(DB_FAT_EMPRESAS)]
          ```

          6. Endpoints HTTP definidos (tabla)
          | Método | Ruta | Archivo | Relación con Workflows |
          | --- | --- | --- | --- |
          | POST | `/` (cualquier path distinto a `/prueba-sheetjs` cae aquí) | [workers/wf-procesar-factura/src/index.ts](workers/wf-procesar-factura/src/index.ts#L6-L27) | Lanza `env.WF_PROCESAR_FACTURA.create` con payload validado |
          | GET | `/prueba-sheetjs` | [workers/wf-procesar-factura/src/index.ts](workers/wf-procesar-factura/src/index.ts#L9-L61) | Operación de prueba; no invoca Workflow |

          7. Configuración Wrangler (tabla)
          | Propiedad | Valor | Archivo | Componente que la consume |
          | --- | --- | --- | --- |
          | name | `"wf-procesar-factura"` | [workers/wf-procesar-factura/wrangler.toml](workers/wf-procesar-factura/wrangler.toml#L1-L4) | Worker/Workflow script |
          | main | `src/index.ts` | [workers/wf-procesar-factura/wrangler.toml](workers/wf-procesar-factura/wrangler.toml#L1-L4) | Worker HTTP entrypoint |
          | compatibility_date | `2025-09-27` | [workers/wf-procesar-factura/wrangler.toml](workers/wf-procesar-factura/wrangler.toml#L1-L4) | Worker/Workflow |
          | usage_model | `unbound` | [workers/wf-procesar-factura/wrangler.toml](workers/wf-procesar-factura/wrangler.toml#L1-L4) | Worker |
          | KV binding | `NSKV_SECRETOS` (id 5a55872de9504ce2b11ec16d6d0b6621) | [workers/wf-procesar-factura/wrangler.toml](workers/wf-procesar-factura/wrangler.toml#L6-L9) | Workflow/Worker |
          | KV binding | `NSKV_PROMPTS` (id f7e60e8e34bb4e8ea443cd59105fcbd6) | [workers/wf-procesar-factura/wrangler.toml](workers/wf-procesar-factura/wrangler.toml#L11-L14) | Workflow |
          | R2 binding | `R2_FACTURAS` (bucket r2-facturas-archivos) | [workers/wf-procesar-factura/wrangler.toml](workers/wf-procesar-factura/wrangler.toml#L16-L19) | Workflow y GET de prueba |
          | D1 binding | `DB_FAT_EMPRESAS` (id 399611ab-ab7d-4df5-bf6f-e525f2144c8a) | [workers/wf-procesar-factura/wrangler.toml](workers/wf-procesar-factura/wrangler.toml#L21-L23) | Workflow y GET de prueba |
          | Workflow binding | `WF_PROCESAR_FACTURA` → clase `ProcesarFacturaWorkflow` | [workers/wf-procesar-factura/wrangler.toml](workers/wf-procesar-factura/wrangler.toml#L23-L27) | Invocado desde Worker |

          8. Mapa de relaciones técnicas (DdF)
          ```mermaid
          graph LR
            FileIndex[workers/wf-procesar-factura/src/index.ts] --> Worker(Worker HTTP)
              Worker -->|create| WFEntry[workers/wf-procesar-factura/src/workflow.ts]
                WFEntry --> R2[(R2_FACTURAS)]
                  WFEntry --> KVSec[(NSKV_SECRETOS)]
                    WFEntry --> KVProm[(NSKV_PROMPTS)]
                      WFEntry --> D1[(DB_FAT_EMPRESAS)]
                        Worker -.-> R2
                          Worker -.-> D1
                          ```

                          9. Limitaciones del análisis
                          - `node_modules` y `dist` no se expandieron en el árbol por volumen (miles de archivos); se confirmó su existencia mediante `package-lock.json` y presencia en disco, pero no se documentó su contenido individual.
                          - No se hallaron otros wrangler.* ni scripts adicionales; el análisis se restringe a la estructura presente en la rama main local sin verificar despliegues externos.
                          