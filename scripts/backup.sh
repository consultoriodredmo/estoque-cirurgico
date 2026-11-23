#!/usr/bin/env bash
# Cópia de segurança externa: exporta o banco, criptografa e (opcionalmente)
# envia para o Cloudflare R2.
#
# Variáveis:
#   BACKUP_DATABASE_URL    conexão direta ao banco (no Supabase: "Session pooler" ou conexão direta)
#   BACKUP_AGE_RECIPIENT   chave PÚBLICA age (começa com "age1..."). Quem tem só a
#                          chave pública consegue criptografar, mas não abrir.
#   BACKUP_DIR             pasta de saída (padrão: ./backups)
#   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
#                          opcionais; se presentes, o arquivo é enviado ao R2.
#
# Saída: imprime o caminho do arquivo criado na última linha.
set -euo pipefail

: "${BACKUP_DATABASE_URL:?defina BACKUP_DATABASE_URL}"
: "${BACKUP_AGE_RECIPIENT:?defina BACKUP_AGE_RECIPIENT (chave pública age)}"

pasta="${BACKUP_DIR:-./backups}"
mkdir -p "$pasta"
carimbo="$(date -u +%Y-%m-%dT%H%MZ)"
arquivo="$pasta/estoque-$carimbo.dump.age"

# Formato custom do pg_dump (comprimido, restaurável seletivamente).
# Só os esquemas do sistema: "public" (dados) e "drizzle" (controle de migrações).
# O conteúdo nunca toca o disco sem criptografia: vai direto do pg_dump para o age.
pg_dump --format=custom --no-owner --no-privileges \
  --schema=public --schema=drizzle \
  --dbname="$BACKUP_DATABASE_URL" \
  | age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$arquivo"

if [[ ! -s "$arquivo" ]]; then
  echo "Falha: arquivo de backup vazio" >&2
  exit 1
fi

if [[ -n "${R2_BUCKET:-}" ]]; then
  : "${R2_ACCOUNT_ID:?defina R2_ACCOUNT_ID}"
  AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:?defina R2_ACCESS_KEY_ID}" \
  AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:?defina R2_SECRET_ACCESS_KEY}" \
  AWS_DEFAULT_REGION=auto \
    aws s3 cp "$arquivo" "s3://$R2_BUCKET/$(basename "$arquivo")" \
      --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" --only-show-errors
  echo "Enviado ao R2: $R2_BUCKET/$(basename "$arquivo")" >&2
fi

echo "$arquivo"
