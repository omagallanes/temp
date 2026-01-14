# wf-procesar-factura

Entorno de desarrollo para el Cloudflare Worker `wf-procesar-factura`.

Requisitos:
- Node.js 20+
- wrangler (se usa el binario vía npx)

Scripts principales:
- `npm run dev` — desarrollar localmente con `wrangler dev`
- `npm run build` — compilar bundle
- `npm run test` — ejecutar tests (vitest)
- `npm run deploy` — publicar a Cloudflare (usa secrets en CI)

Bindings esperados (en `wrangler.toml` o en el entorno):
- `NSKV_SECRETOS` (KV namespace para secretos como OPENAI_API_KEY)
- `NSKV_PROMPTS` (KV namespace para plantillas)
- `R2_FACTURAS` (R2 bucket para resultados)
- `WF_PROCESAR_FACTURA` (workflow binding)

CI/CD: ver `.github/workflows/deploy-wf-procesar-factura.yml` (se desplegará solo cuando cambien archivos en `workers/wf-procesar-factura/**`).
