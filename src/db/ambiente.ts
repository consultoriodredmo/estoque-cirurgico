import { eq } from "drizzle-orm";
import type { Ambiente } from "@/lib/env";
import type { Db } from "./client";
import { ambienteSistema } from "./schema";

export async function lerMarcaAmbiente(db: Db): Promise<Ambiente | null> {
  const [linha] = await db
    .select({ ambiente: ambienteSistema.ambiente })
    .from(ambienteSistema)
    .where(eq(ambienteSistema.id, 1));
  return (linha?.ambiente as Ambiente | undefined) ?? null;
}

/**
 * Grava a marca de ambiente na primeira execução e, nas seguintes, confere se
 * o banco é mesmo do ambiente esperado. Impede, por exemplo, que o sistema de
 * teste seja apontado por engano para o banco de produção.
 */
export async function garantirMarcaAmbiente(db: Db, esperado: Ambiente): Promise<void> {
  await db.insert(ambienteSistema).values({ id: 1, ambiente: esperado }).onConflictDoNothing();
  const atual = await lerMarcaAmbiente(db);
  if (atual !== esperado) {
    throw new Error(
      `Este banco está marcado como "${atual}", mas a configuração diz "${esperado}". ` +
        "Confira a DATABASE_URL antes de continuar.",
    );
  }
}

/** Trava para scripts que só podem rodar em banco de teste (dados fictícios, restauração). */
export async function exigirBancoDeTeste(db: Db): Promise<void> {
  const atual = await lerMarcaAmbiente(db);
  if (atual === "producao") {
    throw new Error("Operação recusada: este é o banco de PRODUÇÃO.");
  }
}
