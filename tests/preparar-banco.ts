/**
 * Antes dos testes: recria do zero dois bancos locais, aplica as migrações e
 * marca um como "teste" e outro como "producao" (para testar as travas).
 *
 * TEST_DATABASE_URL aponta para o servidor de testes. O nome do banco precisa
 * terminar em "_test": é uma trava para nunca apagar um banco de verdade.
 */
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { garantirMarcaAmbiente } from "../src/db/ambiente";
import { comBanco } from "../src/db/client";

export const URL_TESTE =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5432/estoque_test";

export function urlDoBanco(base: string, nome: string): string {
  const url = new URL(base);
  url.pathname = `/${nome}`;
  return url.toString();
}

export const URL_TESTE_PRODUCAO = urlDoBanco(URL_TESTE, "estoque_marcado_producao_test");

async function recriar(url: string) {
  const nome = new URL(url).pathname.slice(1);
  if (!nome.endsWith("_test")) {
    throw new Error(`Recusado: o banco de testes precisa terminar em "_test" (recebido "${nome}").`);
  }
  const admin = postgres(urlDoBanco(url, "postgres"), { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${nome}" WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE "${nome}"`);
  } finally {
    await admin.end();
  }
}

export default async function prepararBanco() {
  for (const [url, ambiente] of [
    [URL_TESTE, "teste"],
    [URL_TESTE_PRODUCAO, "producao"],
  ] as const) {
    await recriar(url);
    await comBanco(url, async (db) => {
      await migrate(db, { migrationsFolder: "./drizzle" });
      await garantirMarcaAmbiente(db, ambiente);
    });
  }
}
