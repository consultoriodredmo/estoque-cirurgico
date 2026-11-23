/**
 * Aplica as migrações pendentes e confere a marca de ambiente do banco.
 * Uso: npm run db:migrar   (lê DATABASE_URL e APP_ENV do ambiente ou do .env)
 */
import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { garantirMarcaAmbiente } from "../src/db/ambiente";
import { comBanco } from "../src/db/client";
import { lerEnvServidor } from "../src/lib/env";

async function main() {
  const env = lerEnvServidor();
  await comBanco(env.databaseUrl, async (db) => {
    await migrate(db, { migrationsFolder: "./drizzle" });
    await garantirMarcaAmbiente(db, env.ambiente);
  });
  console.log(`Migrações aplicadas. Banco marcado como "${env.ambiente}".`);
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
