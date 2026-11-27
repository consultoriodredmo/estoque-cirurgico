# Estoque Cirúrgico

Sistema web de gestão de estoque de materiais cirúrgicos da clínica.
Plano completo e decisões: documento "Estoque Cirúrgico — Arquitetura e Plano de Execução".

**Situação:** etapas 1.1 (fundação), 1.2 (login e perfis), 1.3 (produtos, tamanhos e fornecedores) 1.4 (saldos por local e livro de movimentações) e 2.1 (cadastro manual de cirurgias) concluídas.

## Tecnologia

| Peça | Escolha |
| --- | --- |
| Aplicação | Next.js 16 + TypeScript |
| Hospedagem | Cloudflare Workers (via OpenNext) |
| Banco | PostgreSQL (Supabase, região São Paulo) |
| Acesso ao banco | Drizzle ORM + postgres.js, só pelo servidor |
| Login | Better Auth: e-mail + senha + código TOTP obrigatório, usuários no próprio banco |
| Testes | Vitest com Postgres real |
| Backup externo | pg_dump criptografado com age, enviado ao Cloudflare R2 |

## Rodar no computador

Requisitos: Node 22+ e um PostgreSQL local.

```bash
npm install
cp .env.example .env          # ajuste a DATABASE_URL
npm run db:migrar             # cria as tabelas e marca o banco como "teste"
npm run usuario:admin -- --nome "Nome Completo" --email pessoa@clinica.com.br
npm run catalogo:carga        # cadastra os 15 materiais iniciais (não duplica)
npm run dev                   # http://localhost:3000
```

Verificações (as mesmas que rodam no GitHub a cada envio):

```bash
npm run verificar             # lint + tipos + testes
npm run build
npm run cf:build              # build para a Cloudflare
```

Os testes recriam do zero o banco indicado em `TEST_DATABASE_URL`
(padrão `postgres://postgres@localhost:5432/estoque_test`). O nome precisa terminar em `_test`.

## Travas de segurança já ativas

- **Marca de ambiente no banco.** Cada banco guarda se é de `teste` ou `producao`, e essa marca não pode ser alterada. O sistema se recusa a usar um banco cuja marca não bate com `APP_ENV`.
- **Faixa "AMBIENTE DE TESTE"** em todas as telas, a menos que `APP_ENV=producao`.
- **Registros imutáveis.** A função `bloquear_alteracao()` impede UPDATE e DELETE. Será aplicada ao livro de movimentações e à auditoria na etapa 1.4.
- **Navegador sem acesso direto ao banco.** No Supabase, as permissões dos papéis `anon` e `authenticated` são removidas e o RLS fica ligado sem políticas.
- **Cabeçalhos de segurança** (sem iframe, HSTS, sem indexação por buscadores).
- **`/api/saude`** informa só `ok` ou `erro`, sem detalhes internos.

## Login e perfis (etapa 1.2)

- **Cadastro aberto desligado.** Só o administrador cria contas, com senha temporária mostrada uma única vez.
- **Primeiro acesso obrigatório:** a pessoa troca a senha (mínimo de 10 caracteres) e configura o código no aplicativo autenticador. Recebe 8 códigos de recuperação.
- **Sessão de 12 horas.** Desativar um usuário ou mudar o perfil corta a sessão na hora.
- **Limite de tentativas:** 5 por minuto por IP no login e no código. O código do autenticador também bloqueia após 5 erros, por 15 minutos.
- **Perfis:** `administrador`, `compras` (Mariana) e `hospital` (Eliadna). A tabela de permissões fica em `src/lib/permissoes.ts`. Toda página e ação chama `exigirPermissao()` no servidor.
- **Administrador:** não pode se passar por outro usuário, nem mudar o próprio perfil ou se desativar.
- **Redefinir acesso** (senha esquecida ou celular perdido) gera uma senha temporária nova, apaga o código antigo e encerra as sessões.
- **Auditoria imutável:** registra login, falhas, saídas, troca de senha, ativação do código, ações sobre usuários e acessos negados. Nunca guarda senhas.

## Catálogo (etapa 1.3)

- **15 materiais iniciais** em `src/lib/catalogo/carga-inicial.ts`, com dados das etiquetas e as respostas da equipe. Sem preços nem fornecedores: a Mariana cadastra.
- **Tamanhos:** cada tamanho terá estoque e alertas próprios. Produto sem tamanho fica como "Único".
- **Fornecedores por produto:** embalagem de compra, unidades por embalagem (ex.: caixa de cola com 12 aplicadores), preço, prazo, pedido mínimo e código no fornecedor.
- **Histórico de preço e prazo:** só inclusão, uma linha a cada mudança.
- **Nada é apagado:** produtos, tamanhos e fornecedores são desativados, e o banco recusa exclusões.
- **A Eliadna** vê produtos, tamanhos e fornecedores, mas nenhum valor, e não edita nada.
- **Toda alteração** fica na auditoria com o valor anterior e o novo.

## Estoque (etapa 1.4)

- **Três locais:** consultório, farmácia do hospital e armário privativo. Saldo por tamanho em cada um.
- **Livro de movimentações:** cada lançamento (carga inicial, ajuste por contagem ou estorno) tem motivo, usuário e hora, e guarda o saldo depois de cada linha. O banco recusa alterar ou apagar lançamentos.
- **Saldo só pelo livro:** quem atualiza o saldo é o próprio banco, ao gravar a movimentação. Uma alteração direta no saldo é recusada.
- **Contagem:** digita-se o contado; o sistema lança só a diferença. Saldo negativo é recusado. Enviar o mesmo formulário duas vezes não duplica.
- **Estorno:** cria um lançamento com as quantidades invertidas. Não se estorna duas vezes nem se estorna um estorno.
- **Custo médio ponderado** por tamanho, somando os três locais. Só muda quando entra quantidade com custo informado.
- **A Mariana** ajusta sem aprovação (decisão 5), sempre com registro. **A Eliadna** vê as quantidades, mas não valores, e não ajusta.

## Cirurgias (etapa 2.1)

- **Cadastro manual** até a integração com o calendário (Fase 5): paciente (nome completo), data, hora opcional, procedimentos, tecnologias, tamanho do chinelo e observação operacional.
- **Quem cadastra:** administrador e compras. O hospital consulta.
- **Procedimentos e tecnologias** são cadastráveis pelo administrador e nunca apagados; o código de cada um não muda, porque as regras de kit dependem dele.
- **Cancelar, não apagar:** cancela-se com motivo e dá para reativar. Depois do consumo confirmado (etapa 2.3), a cirurgia não muda mais.
- **LGPD:** a auditoria registra data, procedimentos e o id da cirurgia, nunca o nome da paciente.

## Estrutura

```
src/app/            telas e rotas (Next.js)
src/db/             conexão, esquema e marca de ambiente
src/lib/            configuração e verificação de saúde
drizzle/            migrações SQL (geradas + manuais)
scripts/            migração, backup, restauração
tests/              testes automáticos
.github/workflows/  verificação a cada envio e backup diário
```

No Supabase, o sistema usa o *Transaction pooler* (porta 6543). Migrações e backups usam a conexão *Session pooler* (porta 5432).

Nova migração: altere `src/db/schema.ts`, rode `npm run db:gerar` e confira o SQL gerado antes de aplicar.

## Backup e restauração

Chave de criptografia (fazer **uma vez**, no computador do responsável):

```bash
age-keygen -o chave-backup.txt
```

- A linha `public key: age1...` é a **chave pública**. Vai para o segredo `BACKUP_AGE_RECIPIENT` no GitHub.
- O arquivo `chave-backup.txt` é a **chave privada**. Guarde em dois lugares seguros fora da nuvem do sistema, por exemplo um gerenciador de senhas e um pendrive no cofre. **Sem ela, nenhum backup pode ser aberto.**

Backup manual: `BACKUP_DATABASE_URL=... BACKUP_AGE_RECIPIENT=age1... scripts/backup.sh`

Restaurar: `RESTORE_DATABASE_URL=... BACKUP_AGE_IDENTITY_FILE=chave-backup.txt scripts/restaurar.sh arquivo.dump.age`.
O script recusa sobrescrever o banco de produção, salvo com `CONFIRMO_SOBRESCREVER_PRODUCAO=sim`.

**Teste mensal de restauração:**
`scripts/testar-restauracao.sh` faz backup, restaura num banco vazio e confere cada tabela.
Depois do teste, apague o banco de restauração: ele contém cópia dos dados reais.

Observação: o backup externo cobre os dados do sistema (esquemas `public` e `drizzle`). As contas de login (Supabase Auth, a partir da etapa 1.2) ficam no backup diário do próprio Supabase. Na pior hipótese, os três usuários são convidados de novo.

## Contas a criar (pelo responsável da clínica)

Nenhuma conta foi criada em nome da clínica. Para colocar o ambiente de teste no ar:

1. **GitHub:** repositório privado para este código.
2. **Supabase:** projeto **gratuito** `estoque-teste`, região *South America (São Paulo)*. Ele recebe só dados fictícios. O projeto de produção, no plano Pro, só é criado antes da entrada do estoque real.
3. **Cloudflare Workers, plano pago (US$ 5/mês):** o plano gratuito limita cada requisição a 10 ms de processamento, e a verificação segura da senha leva cerca de 90 ms. Depois de assinar:
   `npx wrangler login`, `npx wrangler secret put DATABASE_URL --env teste`, `npx wrangler secret put BETTER_AUTH_SECRET --env teste` e `npm run cf:deploy:teste`.
   Em `wrangler.jsonc`, ajuste `BETTER_AUTH_URL` de cada ambiente para o endereço real.
4. **Cloudflare R2:** bucket `estoque-backups` com regra de ciclo de vida apagando arquivos após 90 dias, e um token de API com acesso só a esse bucket.
5. **Segredos no GitHub:** os da seção de backup e de `.github/workflows/backup.yml`.

Se o backup diário falhar, o GitHub envia e-mail ao dono do repositório.
