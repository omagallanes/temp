# Documentación: Archivos creados para wf-procesar-factura

Fecha: 2026-01-14 13:55:49

A continuación se muestra una tabla con los archivos creados o movidos durante la implementación, su función y qué hacen.

ID | Archivo | Función | Qué hace
--- | --- | --- | ---
1 | `workers/wf-procesar-factura/package.json` | Manifesto del paquete | Define scripts (dev/build/test/deploy) y dependencias/devDependencies para el worker.
2 | `workers/wf-procesar-factura/tsconfig.json` | Configuración TypeScript | Ajustes de compilador y tipos para compilar `src/` orientado a Workers.
3 | `workers/wf-procesar-factura/wrangler.toml` | Config Wrangler | Configura nombre, compatibility_date, account id y bindings (KV, R2, workflow) para despliegue.
4 | `workers/wf-procesar-factura/.gitignore` | Ignorar artefactos | Excluye `node_modules`, `dist`, `.env` y otros archivos que no deben versionarse.
5 | `workers/wf-procesar-factura/README.md` | Documentación de dev | Instrucciones de desarrollo local, bindings esperados y comandos útiles.
6 | `workers/wf-procesar-factura/.eslintrc.cjs` | Linter config | Reglas básicas de ESLint para mantener la calidad del código TypeScript.
7 | `workers/wf-procesar-factura/.prettierrc` | Formateo | Reglas de Prettier para formato consistente del código.
8 | `workers/wf-procesar-factura/src/types/env.d.ts` | Tipos de bindings | Define la interfaz `Env` con KV, R2 y binding de workflow para autocompletado y verificación de tipos.
9 | `workers/wf-procesar-factura/src/index.ts` | Handler HTTP | Endpoint `fetch` que valida la petición POST y crea una instancia del workflow (`WF_PROCESAR_FACTURA.create`).
10 | `workers/wf-procesar-factura/src/workflow.ts` | Lógica del workflow | Implementa `ProcesarFacturaWorkflow.run` (leer plantilla desde KV, llamar a OpenAI, guardar en R2, manejar errores).
11 | `workers/wf-procesar-factura/src/lib/openai.ts` | Helper OpenAI | Encapsula la llamada a la API de OpenAI (fetch, manejo de errores y parseo).
12 | `workers/wf-procesar-factura/src/lib/storage.ts` | Helpers storage | Wrappers pequeños para R2 `put` y KV `get` para facilitar pruebas y reutilización.
13 | `workers/wf-procesar-factura/test/fetch.handler.test.ts` | Tests del handler | Pruebas unitarias que verifican validaciones de entrada y comportamiento de encolado (mock de `WF_PROCESAR_FACTURA`).
14 | `workers/wf-procesar-factura/test/workflow.test.ts` | Tests del workflow | Prueba la ejecución del workflow con servicios mockeados (KV/R2/OpenAI) para rutas felices y errores.
15 | `workers/wf-procesar-factura/vitest.config.ts` | Config de tests | Configuración de Vitest para ejecutar las pruebas en el entorno adecuado.
16 | `.github/workflows/deploy-wf-procesar-factura.yml` | CI/CD (deploy) | Workflow que ejecuta tests/build y publica a Cloudflare **solo** si cambian archivos en `workers/wf-procesar-factura/**` (usa secrets para autenticación).
17 | `archivos_archivo/wf-procesar-factura/wf-procesar-factura.js` | Artefacto compilado (archivado) | Copia del bundle JS exportado desde Cloudflare (guardado como archivo de referencia/backup, no para desarrollo).
18 | `archivos_archivo/wf-procesar-factura/wf-procesar-factura.metadata.json` | Metadata del worker | Metadatos exportados (id, tag, compatibilty_date, handlers) útiles para referencia y auditoría.

---

Si quieres, puedo añadir más campos a este documento (ej.: quién lo creó, IDs de recursos en Cloudflare, o checklist de pre-despliegue). ¿Quieres que lo amplíe?