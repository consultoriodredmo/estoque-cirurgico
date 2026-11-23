#!/usr/bin/env bash
# Teste de restauração (rodar todo mês): faz um backup do banco de origem,
# restaura num banco vazio e confere, tabela por tabela, se a quantidade de
# linhas é igual. "Backup que nunca foi restaurado não conta."
#
# Variáveis:
#   BACKUP_DATABASE_URL        banco de origem
#   RESTORE_DATABASE_URL       banco VAZIO de destino (será sobrescrito)
#   BACKUP_AGE_RECIPIENT       chave pública age
#   BACKUP_AGE_IDENTITY_FILE   chave privada age correspondente
set -euo pipefail

: "${BACKUP_DATABASE_URL:?}" "${RESTORE_DATABASE_URL:?}"
if [[ "$BACKUP_DATABASE_URL" == "$RESTORE_DATABASE_URL" ]]; then
  echo "Recusado: origem e destino são o mesmo banco." >&2
  exit 1
fi

aqui="$(cd "$(dirname "$0")" && pwd)"
arquivo="$(BACKUP_DIR="$(mktemp -d)" R2_BUCKET="" "$aqui/backup.sh" | tail -1)"
echo "Backup criado: $(basename "$arquivo") ($(du -h "$arquivo" | cut -f1))"

"$aqui/restaurar.sh" "$arquivo"

contagens() {
  psql "$1" -Atq <<'SQL'
select format('select %L || '' '' || count(*) from %I.%I', schemaname || '.' || tablename, schemaname, tablename)
from pg_tables where schemaname in ('public', 'drizzle') order by 1
\gexec
SQL
}

origem="$(contagens "$BACKUP_DATABASE_URL")"
destino="$(contagens "$RESTORE_DATABASE_URL")"
rm -f "$arquivo"

echo "Tabela / linhas na origem:"
echo "$origem" | sed 's/^/  /'
if [[ "$origem" == "$destino" ]]; then
  echo "RESTAURAÇÃO OK: todas as tabelas conferem."
else
  echo "FALHA: diferenças entre origem e restauração:" >&2
  diff <(echo "$origem") <(echo "$destino") >&2 || true
  exit 1
fi
