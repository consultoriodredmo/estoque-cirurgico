/**
 * Cria um administrador pela linha de comando (o primeiro usuário do sistema).
 * Uso: npm run usuario:admin -- --nome "Nome Completo" --email pessoa@clinica.com.br
 * Mostra uma senha temporária; no primeiro acesso a pessoa troca a senha e
 * configura o código de verificação.
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { registrarAuditoria } from "../src/db/auditoria";
import { comBanco } from "../src/db/client";
import { criarAuth } from "../src/lib/auth";
import { lerEnvServidor } from "../src/lib/env";
import { criarUsuarioDireto, gerarSenhaTemporaria } from "../src/lib/usuarios";

async function main() {
  const { values } = parseArgs({ options: { nome: { type: "string" }, email: { type: "string" } } });
  if (!values.nome || !values.email) {
    throw new Error('Uso: npm run usuario:admin -- --nome "Nome Completo" --email pessoa@clinica.com.br');
  }
  const env = lerEnvServidor();
  const senha = gerarSenhaTemporaria();
  await comBanco(env.databaseUrl, async (db) => {
    const auth = criarAuth(db, { secret: env.authSecret, baseURL: env.baseUrl, producao: env.ambiente === "producao" });
    const id = await criarUsuarioDireto(auth, { nome: values.nome!, email: values.email!, perfil: "administrador", senha });
    await registrarAuditoria(db, {
      acao: "usuario_criado",
      entidade: "usuario",
      entidadeId: id,
      detalhes: { perfil: "administrador", origem: "linha de comando" },
    });
  });
  console.log(`Administrador criado no banco de ${env.ambiente.toUpperCase()}.`);
  console.log(`E-mail: ${values.email.trim().toLowerCase()}`);
  console.log(`Senha temporária: ${senha}`);
  console.log("Entre no sistema, troque a senha e configure o código de verificação.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
