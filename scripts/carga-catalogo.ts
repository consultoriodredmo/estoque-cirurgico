/**
 * Cadastra os materiais iniciais (pode rodar mais de uma vez; não duplica).
 * Uso: npm run catalogo:carga
 */
import "dotenv/config";
import { comBanco } from "../src/db/client";
import { carregarCatalogoInicial } from "../src/lib/catalogo/carga-inicial";
import { lerEnvServidor } from "../src/lib/env";

async function main() {
  const env = lerEnvServidor();
  const r = await comBanco(env.databaseUrl, carregarCatalogoInicial);
  console.log(`Banco de ${env.ambiente.toUpperCase()}: ${r.criados.length} produtos criados, ${r.existentes.length} já existiam.`);
  for (const n of r.criados) console.log(`  + ${n}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
