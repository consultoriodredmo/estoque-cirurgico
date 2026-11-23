import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
/** Transação aberta com `db.transaction(...)`. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Banco ou transação: as funções de escrita aceitam os dois. */
export type Executor = Db | Tx;

/** Abre uma conexão. Quem abre fecha: prefira `comBanco`. */
export function abrirBanco(databaseUrl: string): { db: Db; fechar: () => Promise<void> } {
  const conexao = postgres(databaseUrl, {
    max: 1,
    prepare: false, // exigido pelo pooler do Supabase (modo transação)
    connect_timeout: 10,
    idle_timeout: 5,
    onnotice: () => {},
  });
  return { db: drizzle(conexao, { schema }), fechar: () => conexao.end({ timeout: 5 }) };
}

/**
 * Abre uma conexão, executa `fn` e fecha a conexão em seguida.
 *
 * Por que não uma conexão global: na Cloudflare cada requisição precisa da
 * própria conexão. Com três usuários, abrir e fechar por requisição é barato.
 */
export async function comBanco<T>(databaseUrl: string, fn: (db: Db) => Promise<T>): Promise<T> {
  const { db, fechar } = abrirBanco(databaseUrl);
  try {
    return await fn(db);
  } finally {
    await fechar();
  }
}
