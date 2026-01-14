# 📋 Resumen de Despliegue - wf-procesar-factura

## ✅ Completado

- ✅ Código committeado y pusheado a GitHub (main)
- ✅ Tests del workflow pasando correctamente
- ✅ Documentación de despliegue creada ([DEPLOYMENT.md](./DEPLOYMENT.md))
- ✅ Script de despliegue creado ([deploy.sh](./deploy.sh))

## ⏳ Pendiente: Configuración de Cloudflare

Para completar el despliegue, necesitas:

### 1. Autenticarte en Cloudflare

```bash
cd /workspaces/temp/workers/wf-procesar-factura
npx wrangler login
```

Esto abrirá tu navegador para autenticarte.

### 2. Configurar wrangler.toml

Edita `wrangler.toml` y reemplaza los placeholders con tus valores reales:

- `<CLOUDFLARE_ACCOUNT_ID>` → Tu Account ID
- `<NSKV_SECRETOS_ID>` → ID del KV namespace para secretos
- `<NSKV_PROMPTS_ID>` → ID del KV namespace para prompts
- `<R2_FACTURAS_BUCKET_NAME>` → Nombre de tu bucket R2
- `<D1_FAT_EMPRESAS>` → Nombre de tu database D1
- `<D1_FAT_EMPRESAS_ID>` → ID de tu database D1

Para obtener estos IDs:

```bash
# Account ID: lo encuentras en tu dashboard de Cloudflare
# KV Namespaces
npx wrangler kv:namespace list

# R2 Buckets
npx wrangler r2 bucket list

# D1 Databases
npx wrangler d1 list
```

### 3. Crear recursos si no existen

Si aún no tienes los recursos, créalos:

```bash
# Crear KV namespaces
npx wrangler kv:namespace create "NSKV_SECRETOS"
npx wrangler kv:namespace create "NSKV_PROMPTS"

# Crear R2 bucket
npx wrangler r2 bucket create r2-facturas

# Crear D1 database
npx wrangler d1 create fat_empresas
npx wrangler d1 execute fat_empresas --file=./schema.sql
```

### 4. Desplegar

Una vez todo configurado:

```bash
./deploy.sh
```

O manualmente:

```bash
npm test && npx wrangler deploy
```

## 🔗 Recursos útiles

- [Documentación de Wrangler](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare Workflows (Beta)](https://developers.cloudflare.com/workflows/)
- [D1 Databases](https://developers.cloudflare.com/d1/)
- [R2 Storage](https://developers.cloudflare.com/r2/)

## 📝 Notas

- Los Cloudflare Workflows están en beta, asegúrate de tener acceso
- Necesitas configurar el prompt de OpenAI en el KV `NSKV_PROMPTS` con la key `facturas-extraer-texto`
- Configura tu API key de OpenAI en el KV `NSKV_SECRETOS` con la key `OPENAI_API_KEY`
