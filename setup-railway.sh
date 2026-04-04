#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-railway.sh — CRM 7Business
# Configura DATABASE_URL no Railway via CLI
# Uso: bash setup-railway.sh "postgresql://postgres.xxxx:SENHA@host:6543/postgres"
# ─────────────────────────────────────────────────────────────────────────────
set -e

DATABASE_URL="${1}"

# ── Valida argumento ──────────────────────────────────────────────────────────
if [ -z "$DATABASE_URL" ]; then
  echo ""
  echo "❌ Uso correto:"
  echo '   bash setup-railway.sh "postgresql://postgres.SEU_PROJETO:SUA_SENHA@aws-0-us-east-1.pooler.supabase.com:6543/postgres"'
  echo ""
  echo "📋 Onde pegar a URL:"
  echo "   1. Acesse: https://supabase.com/dashboard/project/fgfqbbwpldnjdgpishpn/settings/database"
  echo "   2. Role até 'Connection string'"
  echo "   3. Selecione 'Transaction pooler'"
  echo "   4. Copie a URI e cole entre aspas no comando acima"
  echo ""
  exit 1
fi

# ── Verifica se Railway CLI está instalado ────────────────────────────────────
if ! command -v railway &> /dev/null; then
  echo ""
  echo "⚠️  Railway CLI não encontrado. Instalando..."
  npm install -g @railway/cli
fi

# ── Login (se necessário) ─────────────────────────────────────────────────────
echo ""
echo "🔑 Verificando login no Railway..."
railway whoami 2>/dev/null || railway login

# ── Seta a variável ───────────────────────────────────────────────────────────
echo ""
echo "📡 Configurando DATABASE_URL no Railway..."
railway variables set DATABASE_URL="$DATABASE_URL"

echo ""
echo "✅ DATABASE_URL configurada com sucesso!"
echo ""
echo "🚀 Fazendo redeploy para aplicar..."
railway redeploy --yes

echo ""
echo "🎉 Pronto! A migration vai rodar automaticamente no próximo deploy."
echo "   Acompanhe em: https://railway.app/project/5095dcb4-3c91-4aff-b474-a8f0ddae0849"
echo ""
