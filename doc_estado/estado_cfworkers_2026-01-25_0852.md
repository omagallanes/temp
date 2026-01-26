1. Resumen ejecutivo
- Se identificó un único Worker HTTP `wf-procesar-factura` que expone un handler fetch; es el punto de entrada de la solución y valida eventos de factura recibidos por POST.
- Existe un único Cloudflare Workflow `ProcesarFacturaWorkflow`, registrado en wrangler con el binding `WF_PROCESAR_FACTURA`.
- El Workflow solo se dispara desde el Worker vía `env.WF_PROCESAR_FACTURA.create(...)`; no hay disparadores programados ni cron.

2. Inventario de Workers
- Worker: wf-procesar-factura (main: src/index.ts) definido en wrangler [workers/wf-procesar-factura/wrangler.toml](workers/wf-procesar-factura/wrangler.toml#L1-L27).
- Entrypoint HTTP: handler fetch único, acepta POST con campos obligatorios (invoiceId, r2Key, originalFileName, contentType, fileUrl) y rechaza otros métodos con 405 [workers/wf-procesar-factura/src/index.ts](workers/wf-procesar-factura/src/index.ts#L6-L29).
- Ruta auxiliar de prueba: GET /prueba-sheetjs genera un XLSX con datos D1 y lo sube a R2; no dispara ningún Workflow [workers/wf-procesar-factura/src/index.ts](workers/wf-procesar-factura/src/index.ts#L33-L64).

3. Inventario de Workflows
- Workflow: ProcesarFacturaWorkflow, clase que extiende WorkflowEntrypoint<Env> [workers/wf-procesar-factura/src/workflow.ts](workers/wf-procesar-factura/src/workflow.ts#L42-L426).
- Registro wrangler: binding WF_PROCESAR_FACTURA asociado a la clase y al script wf-procesar-factura [workers/wf-procesar-factura/wrangler.toml](workers/wf-procesar-factura/wrangler.toml#L23-L27).
- Flujo de ejecución (run): descarga PDF y lo guarda en R2 (P1) [workers/wf-procesar-factura/src/workflow.ts](workers/wf-procesar-factura/src/workflow.ts#L53-L122); lee/valida apioresponse [L124-L164]; resuelve proveedor en D1 [L173-L218]; inserta cabecera de factura [L221-L274]; registra metadatos de archivo [L276-L311]; inserta líneas de factura [L313-L370]; genera y sube Excel a R2 y actualiza estado de validación [L372-L425]; helper para nombre de Excel [L429-L433].
- Evento esperado: `event.payload` con invoiceId, fileUrl, r2Key, originalFileName, contentType [workers/wf-procesar-factura/src/workflow.ts](workers/wf-procesar-factura/src/workflow.ts#L43-L45).

4. Relaciones Workers ↔ Workflows
- El Worker HTTP instancia el Workflow mediante `env.WF_PROCESAR_FACTURA.create({ id, params: payload })` tras validar el cuerpo POST [workers/wf-procesar-factura/src/index.ts](workers/wf-procesar-factura/src/index.ts#L22-L27). No hay otras llamadas a `env.<workflow>.start()` ni a otros bindings de Workflow.

5. Cron Triggers
- No se declararon Cron Triggers ni entradas scheduled en wrangler; el archivo solo define bindings de KV, R2, D1 y el Workflow [workers/wf-procesar-factura/wrangler.toml](workers/wf-procesar-factura/wrangler.toml#L1-L27).

6. Elementos no utilizados o sin relación
- No existen otros Workers ni Workflows definidos en el repositorio; `ProcesarFacturaWorkflow` es el único Workflow registrado.
- La ruta GET /prueba-sheetjs opera de forma aislada del Workflow y de cualquier cron; sirve como utilitario manual.
- No se encontró código que inicie Workflows mediante cron o scheduled, ni otros bindings de Workflow referenciados.

7. Conclusiones técnicas
- La arquitectura es lineal: un único Worker HTTP recibe eventos de factura y lanza un único Workflow que orquesta el procesamiento (ingesta en R2, validación, persistencia en D1 y generación de Excel). Todo el arranque del Workflow depende de llamadas HTTP POST al Worker; no hay automatización por tiempo.
- Las dependencias declaradas (KV secretos/prompts, R2 facturas, D1 fat_empresas) se consumen dentro del Workflow para cada etapa de procesamiento.

8. Limitaciones del análisis
- El análisis se basó solo en el código y configuración presentes en el repositorio local en la rama main, sin consultar configuraciones externas ni despliegues remotos.
- No se ejecutaron despliegues ni comandos wrangler que pudieran revelar triggers configurados fuera del código.
