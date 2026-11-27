/** Mostra o estado de login do administrador mais recente do ambiente de teste (sem senhas nem tokens). */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { comBanco } from "../src/db/client";
import { lerEnvServidor } from "../src/lib/env";

async function main() {
  const env = lerEnvServidor();
  if (env.ambiente !== "teste") throw new Error("Só roda no ambiente de teste.");
  await comBanco(env.databaseUrl, async (db) => {
    const u = await db.execute(
      sql`select id, role, banned, deve_trocar_senha, two_factor_enabled, created_at from "user" where role = 'administrador' order by created_at desc limit 1`,
    );
    console.log("usuario:", JSON.stringify(u.map(({ id, ...r }) => ({ ...r, id: String(id).slice(0, 6) }))));
    if (!u.length) return;
    const id = u[0].id as string;
    console.log("agora no banco:", JSON.stringify(await db.execute(sql`select now() as agora, current_setting('TimeZone') as tz`)));
    const s = await db.execute(
      sql`select created_at, updated_at, expires_at, left(user_agent, 70) as ua from session where user_id = ${id} order by created_at`,
    );
    console.log("sessoes:", JSON.stringify(s, null, 1));
    console.log("two_factor:", JSON.stringify(await db.execute(sql`select count(*) from two_factor where user_id = ${id}`)));
    const a = await db.execute(sql`select em, acao from auditoria where usuario_id = ${id} order by id desc limit 25`);
    console.log("auditoria:", JSON.stringify(a, null, 1));
    console.log(
      "colunas:",
      JSON.stringify(
        await db.execute(sql`select column_name, data_type from information_schema.columns where table_name = 'session' and column_name like '%_at'`),
      ),
    );
  });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
