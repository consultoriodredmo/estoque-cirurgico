import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { abrirBanco } from "@/db/client";
import { cirurgias, produtos, saldos, variantes } from "@/db/schema";
import { ErroPermissao, type Ator } from "@/lib/catalogo";
import { carregarCatalogoInicial } from "@/lib/catalogo/carga-inicial";
import { atualizarCirurgia, criarCirurgia, obterCirurgia } from "@/lib/cirurgias";
import { consumoDaCirurgia, desfazerConsumo, materiaisParaConsumo, registrarConsumo } from "@/lib/consumo";
import { estornarLancamento, listarLancamentos, registrarContagem, verificarConsistencia } from "@/lib/estoque";
import { URL_TESTE } from "./preparar-banco";

const { db, fechar } = abrirBanco(URL_TESTE);
afterAll(fechar);

const admin: Ator = { id: "u-admin", perfil: "administrador" };
const mariana: Ator = { id: "u-compras", perfil: "compras" };
const eliadna: Ator = { id: "u-hospital", perfil: "hospital" };

async function variante(produto: string, tamanho = "Único"): Promise<number> {
  const [v] = await db
    .select({ id: variantes.id })
    .from(variantes)
    .innerJoin(produtos, eq(produtos.id, variantes.produtoId))
    .where(and(eq(produtos.nome, produto), eq(variantes.nome, tamanho)));
  return v.id;
}

async function saldo(varianteId: number, local: string) {
  const [s] = await db.select({ q: saldos.quantidade }).from(saldos).where(and(eq(saldos.varianteId, varianteId), eq(saldos.local, local)));
  return s?.q ?? 0;
}

let cintaM: number, cintaG: number, klein: number, cola: number, robe: number;

async function novaCirurgia(procs = ["mamoplastia", "abdominoplastia"]) {
  return criarCirurgia(db, mariana, { paciente: "Paciente Consumo Teste", data: "2027-02-10", procedimentos: procs });
}

beforeAll(async () => {
  await carregarCatalogoInicial(db);
  [cintaM, cintaG, klein, cola, robe] = await Promise.all([
    variante("Cinta cirúrgica", "M"),
    variante("Cinta cirúrgica", "G"),
    variante("Cânula Klein de infiltração"),
    variante("Cola cirúrgica Dermabond High Viscosity"),
    variante("Robe/avental personalizado"),
  ]);
  // Estoque inicial fictício, com custo, para conferir o custo aplicado.
  await registrarContagem(db, mariana, {
    id: randomUUID(),
    local: "armario",
    tipo: "ajuste",
    motivo: "Estoque do teste de consumo",
    itens: [
      { varianteId: cintaM, contado: 10, custoUnitario: 8000 },
      { varianteId: cintaG, contado: 10, custoUnitario: 8000 },
    ],
  });
  await registrarContagem(db, mariana, {
    id: randomUUID(),
    local: "farmacia",
    tipo: "ajuste",
    motivo: "Estoque do teste de consumo",
    itens: [
      { varianteId: klein, contado: 10, custoUnitario: 4500 },
      { varianteId: cola, contado: 24 },
    ],
  });
});

describe("testes de aceitação da especificação", () => {
  it("4. Duas cintas de tamanhos diferentes: baixa cada tamanho", async () => {
    const id = await novaCirurgia();
    const antesM = await saldo(cintaM, "armario");
    const antesG = await saldo(cintaG, "armario");
    await registrarConsumo(db, eliadna, {
      id: randomUUID(),
      cirurgiaId: id,
      linhas: [
        { varianteId: cintaM, local: "armario", quantidade: 1 },
        { varianteId: cintaG, local: "armario", quantidade: 1 },
      ],
    });
    expect(await saldo(cintaM, "armario")).toBe(antesM - 1);
    expect(await saldo(cintaG, "armario")).toBe(antesG - 1);
  });

  it("5. Retirou 3 cânulas, usou 2, devolveu 1: baixa só 2", async () => {
    const id = await novaCirurgia(["lipoaspiracao"]);
    const antes = await saldo(klein, "farmacia");
    // Retirada e devolução na farmácia não são registradas (especificação, seção 7): só o uso efetivo.
    await registrarConsumo(db, eliadna, { id: randomUUID(), cirurgiaId: id, linhas: [{ varianteId: klein, local: "farmacia", quantidade: 2 }] });
    expect(await saldo(klein, "farmacia")).toBe(antes - 2);
  });
});

describe("confirmação do consumo", () => {
  it("só confirma uma vez; reenvio do mesmo formulário não duplica", async () => {
    const id = await novaCirurgia();
    const pedido = { id: randomUUID(), cirurgiaId: id, linhas: [{ varianteId: cola, local: "farmacia", quantidade: 5 }] };
    const antes = await saldo(cola, "farmacia");
    await registrarConsumo(db, eliadna, pedido);
    expect((await registrarConsumo(db, eliadna, pedido)).repetido).toBe(true);
    await expect(registrarConsumo(db, eliadna, { ...pedido, id: randomUUID() })).rejects.toThrow("já foi confirmado");
    expect(await saldo(cola, "farmacia")).toBe(antes - 5);
    expect((await obterCirurgia(db, admin, id))?.situacao).toBe("consumo_confirmado");
    // Depois de confirmada, a cirurgia não muda mais.
    await expect(atualizarCirurgia(db, admin, id, { paciente: "Outra Paciente", data: "2027-02-11", procedimentos: ["mamoplastia"] })).rejects.toThrow(
      "já foi confirmado",
    );
  });

  it("dois envios simultâneos de formulários diferentes: só um baixa", async () => {
    const id = await novaCirurgia();
    const antes = await saldo(cola, "farmacia");
    const r = await Promise.allSettled(
      [1, 2].map(() => registrarConsumo(db, eliadna, { id: randomUUID(), cirurgiaId: id, linhas: [{ varianteId: cola, local: "farmacia", quantidade: 1 }] })),
    );
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await saldo(cola, "farmacia")).toBe(antes - 1);
  });

  it("saldo insuficiente não bloqueia: entra como exceção", async () => {
    const id = await novaCirurgia(["rinoplastia"]);
    const r = await registrarConsumo(db, eliadna, { id: randomUUID(), cirurgiaId: id, linhas: [{ varianteId: robe, local: "armario", quantidade: 1 }] });
    expect(r.excecoes).toEqual([{ produto: "Robe/avental personalizado", tamanho: "Único", local: "armario", saldoApos: -1 }]);
    expect(await verificarConsistencia(db)).toHaveLength(0);
  });

  it("recusa cirurgia cancelada, linha sem quantidade e perfil sem permissão", async () => {
    const id = await novaCirurgia();
    await expect(registrarConsumo(db, mariana, { id: randomUUID(), cirurgiaId: id, linhas: [{ varianteId: cola, local: "farmacia", quantidade: 1 }] })).rejects.toThrow(
      ErroPermissao,
    );
    await expect(registrarConsumo(db, eliadna, { id: randomUUID(), cirurgiaId: id, linhas: [{ varianteId: cola, local: "farmacia", quantidade: 0 }] })).rejects.toThrow(
      "pelo menos um",
    );
    await db.update(cirurgias).set({ situacao: "cancelada" }).where(eq(cirurgias.id, id));
    await expect(registrarConsumo(db, eliadna, { id: randomUUID(), cirurgiaId: id, linhas: [{ varianteId: cola, local: "farmacia", quantidade: 1 }] })).rejects.toThrow(
      "cancelada",
    );
  });

  it("guarda o custo aplicado, mas a Eliadna não vê valores", async () => {
    const id = await novaCirurgia(["lipoaspiracao"]);
    await registrarConsumo(db, eliadna, { id: randomUUID(), cirurgiaId: id, linhas: [{ varianteId: klein, local: "farmacia", quantidade: 1 }] });
    expect((await consumoDaCirurgia(db, admin, id))?.itens[0].custoUnitario).toBe(4500);
    expect((await consumoDaCirurgia(db, eliadna, id))?.itens[0].custoUnitario).toBeNull();
    const materiais = await materiaisParaConsumo(db);
    expect(JSON.stringify(materiais)).not.toMatch(/custo|valor/i);
  });
});

describe("correção", () => {
  it("Eliadna desfaz a confirmação: saldo volta e a cirurgia pode ser confirmada de novo", async () => {
    const id = await novaCirurgia();
    const antes = await saldo(cintaM, "armario");
    await registrarConsumo(db, eliadna, { id: randomUUID(), cirurgiaId: id, linhas: [{ varianteId: cintaM, local: "armario", quantidade: 2 }] });
    const pedido = { id: randomUUID(), cirurgiaId: id, motivo: "Tamanho errado: era G" };
    await desfazerConsumo(db, eliadna, pedido);
    expect((await desfazerConsumo(db, eliadna, pedido)).repetido).toBe(true);
    expect(await saldo(cintaM, "armario")).toBe(antes);
    expect((await obterCirurgia(db, admin, id))?.situacao).toBe("agendada");
    expect(await consumoDaCirurgia(db, admin, id)).toBeNull();

    await registrarConsumo(db, eliadna, { id: randomUUID(), cirurgiaId: id, linhas: [{ varianteId: cintaG, local: "armario", quantidade: 2 }] });
    expect((await consumoDaCirurgia(db, eliadna, id))?.itens).toMatchObject([{ tamanho: "G", quantidade: 2 }]);
    const hist = await listarLancamentos(db, eliadna);
    expect(hist.filter((h) => h.cirurgiaId === id).map((h) => h.tipo).sort()).toEqual(["consumo", "consumo", "estorno"]);
  });

  it("Eliadna estorna consumo, mas não ajuste de inventário", async () => {
    const ajuste = randomUUID();
    await registrarContagem(db, mariana, { id: ajuste, local: "farmacia", tipo: "ajuste", motivo: "Ajuste qualquer", itens: [{ varianteId: cola, contado: 100 }] });
    await expect(estornarLancamento(db, eliadna, { id: randomUUID(), lancamentoId: ajuste, motivo: "Tentativa" })).rejects.toThrow(ErroPermissao);
  });

  it("devolver um consumo recompõe o custo médio no custo em que saiu", async () => {
    const [{ c: antes }] = await db.execute<{ c: string }>(sql`select custo as c from custos_medios where variante_id = ${klein}`);
    const id = await novaCirurgia(["lipoaspiracao"]);
    await registrarConsumo(db, eliadna, { id: randomUUID(), cirurgiaId: id, linhas: [{ varianteId: klein, local: "farmacia", quantidade: 1 }] });
    await desfazerConsumo(db, eliadna, { id: randomUUID(), cirurgiaId: id, motivo: "Desfazer para teste" });
    const [{ c: depois }] = await db.execute<{ c: string }>(sql`select custo as c from custos_medios where variante_id = ${klein}`);
    expect(Number(depois)).toBeCloseTo(Number(antes), 4);
  });
});
