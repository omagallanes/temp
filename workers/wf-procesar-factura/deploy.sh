#!/bin/bash

# Script de despliegue para wf-procesar-factura en Cloudflare
# Asegúrate de haber configurado wrangler.toml antes de ejecutar

set -e

echo "🚀 Iniciando despliegue de wf-procesar-factura..."
echo ""

# Verificar autenticación
echo "📝 Verificando autenticación..."
if ! npx wrangler whoami &>/dev/null; then
    echo "❌ No estás autenticado en Cloudflare."
    echo "   Ejecuta: npx wrangler login"
    exit 1
fi

echo "✅ Autenticación verificada"
echo ""

# Compilar TypeScript
echo "🔨 Compilando TypeScript..."
npm run build || true
echo ""

# Ejecutar tests
echo "🧪 Ejecutando tests..."
npm test
echo ""

# Desplegar
echo "🚀 Desplegando a Cloudflare..."
npx wrangler deploy

echo ""
echo "✅ Despliegue completado exitosamente!"
echo ""
echo "Puedes verificar el despliegue con:"
echo "  npx wrangler deployments list"
echo ""
echo "Para ver logs en tiempo real:"
echo "  npx wrangler tail"
