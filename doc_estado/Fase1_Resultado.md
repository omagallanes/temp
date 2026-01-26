# Fase 1: Inventario técnico y estado actual (solo Worker)

## Punto de entrada HTTP y rutas
- Manejador `fetch` definido en [workers/wf-procesar-factura/src/index.ts](workers/wf-procesar-factura/src/index.ts#L1-L60).
- Rutas observadas:
  - `GET /prueba-sheetjs`: ruta de prueba que valida un token en KV, consulta datos de ejemplo en D1, genera hoja de cálculo y la guarda en R2 (ver [workers/wf-procesar-factura/src/index.ts](workers/wf-procesar-factura/src/index.ts#L7-L54)).
  - `POST /`: ruta principal; valida que el cuerpo sea JSON y exige campos `invoiceId`, `r2Key`, `originalFileName`, `contentType`, `fileUrl`. Rechaza otros métodos con 405 y cuerpos inválidos con 400 (ver [workers/wf-procesar-factura/src/index.ts](workers/wf-procesar-factura/src/index.ts#L11-L33)).

## Dependencias y bindings del Worker
- Declarados en [workers/wf-procesar-factura/wrangler.toml](workers/wf-procesar-factura/wrangler.toml#L1-L15):
  - Workers KV: `NSKV_SECRETOS`, `NSKV_PROMPTS`.
  - R2 bucket: `R2_FACTURAS`.
  - Base de datos D1: `DB_FAT_EMPRESAS`.
  - Workflow binding: `WF_PROCESAR_FACTURA` apuntando a la clase `ProcesarFacturaWorkflow` del mismo paquete.
- Documentación interna en [workers/wf-procesar-factura/README.md](workers/wf-procesar-factura/README.md#L1-L20) confirma los mismos bindings esperados.

## Delegación del Worker hacia Cloudflare Workflows
- La ruta `POST /` invoca el Workflow mediante `env.WF_PROCESAR_FACTURA.create({ id: crypto.randomUUID(), params: payload })` y responde con el identificador de instancia (ver [workers/wf-procesar-factura/src/index.ts](workers/wf-procesar-factura/src/index.ts#L22-L29)).
- El binding `WF_PROCESAR_FACTURA` se configura en [workers/wf-procesar-factura/wrangler.toml](workers/wf-procesar-factura/wrangler.toml#L9-L15) y referencia a la clase `ProcesarFacturaWorkflow` definida en [workers/wf-procesar-factura/src/workflow.ts](workers/wf-procesar-factura/src/workflow.ts#L1-L30) (no se modifica en esta fase).
