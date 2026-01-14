# Guía de Despliegue en Cloudflare

## Preparación

### 1. Configurar wrangler.toml

Edita `wrangler.toml` y reemplaza los placeholders con tus valores reales:

```toml
# Descomenta y configura:
[account]
id = "tu-account-id-real"

[[kv_namespaces]]
binding = "NSKV_SECRETOS"
id = "tu-kv-secretos-id"

[[kv_namespaces]]
binding = "NSKV_PROMPTS"
id = "tu-kv-prompts-id"

[[r2_buckets]]
binding = "R2_FACTURAS"
bucket_name = "tu-bucket-name"

[[d1_databases]]
binding = "DB_FAT_EMPRESAS"
database_name = "tu-database-name"
database_id = "tu-database-id"

[[workflows]]
binding = "WF_PROCESAR_FACTURA"
class_name = "ProcesarFacturaWorkflow"
name = "wf-procesar-factura"
```

### 2. Autenticarse en Cloudflare

```bash
npx wrangler login
```

O usando variables de entorno:

```bash
export CLOUDFLARE_API_TOKEN="tu-api-token"
export CLOUDFLARE_ACCOUNT_ID="tu-account-id"
```

### 3. Obtener IDs de recursos

Para obtener los IDs de tus recursos existentes:

```bash
# Listar KV namespaces
npx wrangler kv:namespace list

# Listar R2 buckets
npx wrangler r2 bucket list

# Listar D1 databases
npx wrangler d1 list
```

## Despliegue

Una vez configurado todo:

```bash
# Desplegar el workflow
npm run deploy
```

O directamente:

```bash
npx wrangler deploy
```

## Verificar despliegue

```bash
# Ver información del worker desplegado
npx wrangler deployments list

# Ver logs en tiempo real
npx wrangler tail
```

## Notas importantes

1. **Workflows en Cloudflare**: Los Cloudflare Workflows están en beta. Asegúrate de que tu cuenta tiene acceso.

2. **D1 Database**: Verifica que el esquema de la base de datos `fat_empresas` esté creado:
   ```sql
   CREATE TABLE IF NOT EXISTS fat_empresas (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     nif_proveedor TEXT NOT NULL UNIQUE,
     nombre_proveedor TEXT NOT NULL,
     nombre_normalizado TEXT NOT NULL
   );
   ```

3. **KV Namespaces**: Asegúrate de tener los prompts necesarios en `NSKV_PROMPTS`:
   - Key: `facturas-extraer-texto`
   - Value: Tu plantilla JSON de OpenAI

4. **Secrets**: Configura el secret de OpenAI:
   ```bash
   npx wrangler secret put OPENAI_API_KEY
   ```
   O guárdalo en el KV `NSKV_SECRETOS`.
