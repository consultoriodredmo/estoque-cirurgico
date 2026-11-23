import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { exigirBancoDeTeste, garantirMarcaAmbiente, lerMarcaAmbiente } from "@/db/ambiente";
import { comBanco } from "@/db/client";
import { verificarSaude } from "@/lib/saude";
import { URL_TESTE, URL_TESTE_PRODUCAO, urlDoBanco } from "./preparar-banco";

/** O Drizzle embrulha o erro do Postgres; a mensagem original fica em `cause`. */
async function erroDoBanco(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
  } catch (e) {
    const erro = e as Error & { cause?: Error };
    return `${erro.message} ${erro.cause?.message ?? ""}`;
  }
  throw new Error("Era esperado que o banco recusasse a operação");
}

describe("marca de ambiente do banco", () => {
  it("o banco de teste fica marcado como teste", async () => {
    expect(await comBanco(URL_TESTE, lerMarcaAmbiente)).toBe("teste");
  });

  it("recusa usar um banco de teste como se fosse produção", async () => {
    await expect(comBanco(URL_TESTE, (db) => garantirMarcaAmbiente(db, "producao"))).rejects.toThrow(
      /marcado como "teste"/,
    );
  });

  it("a marca não pode ser alterada nem apagada", async () => {
    expect(
      await erroDoBanco(comBanco(URL_TESTE, (db) => db.execute(sql`update ambiente_sistema set ambiente = 'producao'`))),
    ).toMatch(/imutável/);
    expect(await erroDoBanco(comBanco(URL_TESTE, (db) => db.execute(sql`delete from ambiente_sistema`)))).toMatch(
      /imutável/,
    );
  });

  it("só existe uma linha de marca", async () => {
    await expect(
      comBanco(URL_TESTE, (db) => db.execute(sql`insert into ambiente_sistema (id, ambiente) values (2, 'teste')`)),
    ).rejects.toThrow();
  });

  it("operações de dados fictícios são recusadas no banco de produção", async () => {
    await expect(comBanco(URL_TESTE, exigirBancoDeTeste)).resolves.toBeUndefined();
    await expect(comBanco(URL_TESTE_PRODUCAO, exigirBancoDeTeste)).rejects.toThrow(/PRODUÇÃO/);
  });
});

describe("registros imutáveis (base do livro de movimentações)", () => {
  it("bloquear_alteracao impede UPDATE e DELETE, mas permite INSERT", async () => {
    await comBanco(URL_TESTE, async (db) => {
      await db.execute(sql`create table if not exists prova_imutavel (id serial primary key, valor int)`);
      await db.execute(sql`drop trigger if exists prova_imutavel_trava on prova_imutavel`);
      await db.execute(
        sql`create trigger prova_imutavel_trava before update or delete on prova_imutavel
            for each row execute function bloquear_alteracao()`,
      );
      await db.execute(sql`insert into prova_imutavel (valor) values (10)`);
    });

    expect(
      await erroDoBanco(comBanco(URL_TESTE, (db) => db.execute(sql`update prova_imutavel set valor = 99`))),
    ).toMatch(/UPDATE em prova_imutavel não é permitido/);
    expect(await erroDoBanco(comBanco(URL_TESTE, (db) => db.execute(sql`delete from prova_imutavel`)))).toMatch(
      /DELETE em prova_imutavel não é permitido/,
    );

    const linhas = await comBanco(URL_TESTE, (db) => db.execute(sql`select valor from prova_imutavel`));
    expect(linhas.map((l) => l.valor)).toEqual([10]);
  });
});

describe("verificação de saúde", () => {
  it("responde ok quando banco e configuração concordam", async () => {
    expect(await verificarSaude({ databaseUrl: URL_TESTE, ambiente: "teste" })).toEqual({
      ok: true,
      ambiente: "teste",
      banco: "ok",
    });
  });

  it("acusa marca divergente sem expor dados", async () => {
    const saude = await verificarSaude({ databaseUrl: URL_TESTE, ambiente: "producao" });
    expect(saude).toEqual({ ok: false, ambiente: "producao", banco: "marca_divergente" });
  });

  it("responde 'erro' sem detalhes quando o banco não existe", async () => {
    const saude = await verificarSaude({
      databaseUrl: urlDoBanco(URL_TESTE, "banco_que_nao_existe"),
      ambiente: "teste",
    });
    expect(saude).toEqual({ ok: false, ambiente: "teste", banco: "erro" });
  });
});
