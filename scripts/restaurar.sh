#!/usr/bin/env bash
# Restaura um backup criptografado num banco de destino.
#
# Uso: scripts/restaurar.sh <arquivo.dump.age>
# Variáveis:
#   RESTORE_DATABASE_URL       banco de destino
#   BACKUP_AGE_IDENTITY_FILE   arquivo com a chave PRIVADA age (guardada fora do servidor)
#   CONFIRMO_SOBRESCREVER_PRODUCAO=sim
#                              obrigatória se o destino for o banco de produção
#                              (só numa recuperação de desastre de verdade).
set -euo pipefail

arquivo="${1:?informe o arquivo .dump.age}"
: "${RESTORE_DATABASE_URL:?defina RESTORE_DATABASE_URL}"
: "${BACKUP_AGE_IDENTITY_FILE:?defina BACKUP_AGE_IDENTITY_FILE (chave privada age)}"

# Trava: não sobrescrever produção por engano.
marca="$(psql "$RESTORE_DATABASE_URL" -Atq -c \
  "select ambiente from ambiente_sistema where id = 1" 2>/dev/null || true)"
if [[ "$marca" == "producao" && "${CONFIRMO_SOBRESCREVER_PRODUCAO:-}" != "sim" ]]; then
  echo "Recusado: o destino é o banco de PRODUÇÃO." >&2
  echo "Para uma recuperação de desastre, rode de novo com CONFIRMO_SOBRESCREVER_PRODUCAO=sim." >&2
  exit 1
fi

age --decrypt --identity "$BACKUP_AGE_IDENTITY_FILE" "$arquivo" \
  | pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error \
      --dbname="$RESTORE_DATABASE_URL"

echo "Restauração concluída em $(psql "$RESTORE_DATABASE_URL" -Atq -c 'select current_database()')." >&2
