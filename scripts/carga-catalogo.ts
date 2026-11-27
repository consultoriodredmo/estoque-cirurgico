/**
 * Cadastra os materiais e as regras de kit iniciais (pode rodar mais de uma vez; não duplica).
 * Uso: npm run catalogo:carga
 */
import "dotenv/config";
import { comBanco } from "../src/db/client";
import { carregarCatalogoInicial } from "../src/lib/catalogo/carga-inicial";
import { lerEnvServidor } from "../src/lib/env";
import { carregarRegrasIniciais } from "../src/lib/regras";

async function main() {
  const env = lerEnvServidor();
  const r = await comBanco(env.databaseUrl, carregarCatalogoInicial);
  console.log(`Banco de ${env.ambiente.toUpperCase()}: ${r.criados.length} produtos criados, ${r.existentes.length} já existiam.`);
  for (const n of r.criados) console.log(`  + ${n}`);
  const regras = await comBanco(env.databaseUrl, carregarRegrasIniciais);
  console.log(regras.criadas ? `${regras.criadas} regras de kit criadas.` : "Regras de kit já existiam (não alteradas).");
  if (regras.faltando.length) console.log(`  Materiais não encontrados: ${regras.faltando.join(", ")}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
