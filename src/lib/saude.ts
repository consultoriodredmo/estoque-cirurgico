import { sql } from "drizzle-orm";
import { lerMarcaAmbiente } from "@/db/ambiente";
import { comBanco } from "@/db/client";
import type { EnvServidor } from "./env";

export type Saude = {
  ok: boolean;
  ambiente: string;
  banco: "ok" | "erro" | "marca_divergente";
};

/**
 * Verificação de funcionamento. Não devolve mensagens de erro do banco nem
 * nenhum dado: só "ok" ou "erro", para não vazar detalhes a quem acessar.
 */
export async function verificarSaude(env: Pick<EnvServidor, "databaseUrl" | "ambiente">): Promise<Saude> {
  try {
    const marca = await comBanco(env.databaseUrl, async (db) => {
      await db.execute(sql`select 1`);
      return lerMarcaAmbiente(db);
    });
    if (marca !== env.ambiente) {
      return { ok: false, ambiente: env.ambiente, banco: "marca_divergente" };
    }
    return { ok: true, ambiente: env.ambiente, banco: "ok" };
  } catch {
    return { ok: false, ambiente: env.ambiente, banco: "erro" };
  }
}
