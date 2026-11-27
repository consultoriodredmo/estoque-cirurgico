import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { abrirBanco } from "@/db/client";
import { custosMedios, lancamentos, movimentacoes, saldos, variantes } from "@/db/schema";
import { criarProduto, ErroCatalogo, ErroPermissao, type Ator } from "@/lib/catalogo";
import { carregarCatalogoInicial } from "@/lib/catalogo/carga-inicial";
import {
  estornarLancamento,
  listarLancamentos,
  listarSaldos,
  registrarContagem,
  verificarConsistencia,
} from "@/lib/estoque";
import { URL_TESTE } from "./preparar-banco";

const { db, fechar } = abrirBanco(URL_TESTE);
afterAll(fechar);

const admin: Ator = { id: "u-admin", perfil: "administrador" };
const mariana: Ator = { id: "u-compras", perfil: "compras" };
const eliadna: Ator = { id: "u-hospital", perfil: "hospital" };

async function erroDoBanco(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as Error & { cause?: Error };
    return `${err.message} ${err.cause?.message ?? ""}`;
  }
  throw new Error("Era esperado que o banco recusasse");
}

let P: number; // tamanho P do produto de teste
let M: number;

async function saldo(varianteId: number, local: string) {
  const [s] = await db
    .select({ q: saldos.quantidade })
    .from(saldos)
    .where(sql`${saldos.varianteId} = ${varianteId} and ${saldos.local} = ${local}`);
  return s?.q ?? 0;
}

async function custo(varianteId: number) {
  const [c] = await db.select().from(custosMedios).where(eq(custosMedios.varianteId, varianteId));
  return c ? Number(c.custo) : null;
}

beforeAll(async () => {
  await carregarCatalogoInicial(db); // idempotente; mantém a ordem dos códigos
  const id = await criarProduto(db, admin, {
    nome: "Material de teste do estoque",
    unidade: "unidade",
    esteril: "sim",
    localPadrao: "farmacia",
    tamanhos: ["P", "M"],
  });
  const vs = await db.select().from(variantes).where(eq(variantes.produtoId, id)).orderBy(asc(variantes.ordem));
  [P, M] = vs.map((v) => v.id);
});

describe("carga inicial e ajuste por contagem", () => {
  it("a carga inicial lança o contado e calcula o saldo", async () => {
    const r = await registrarContagem(db, mariana, {
      id: randomUUID(),
      local: "farmacia",
      tipo: "implantacao",
      motivo: "Contagem inicial da farmácia",
      itens: [
        { varianteId: P, contado: 10, custoUnitario: 1000 },
        { varianteId: M, contado: 4 },
      ],
    });
    expect(r).toEqual({ repetido: false, linhas: 2 });
    expect(await saldo(P, "farmacia")).toBe(10);
    expect(await saldo(M, "farmacia")).toBe(4);
    expect(await custo(P)).toBe(1000);
    expect(await custo(M)).toBeNull();
  });

  it("enviar o mesmo formulário duas vezes não duplica", async () => {
    const id = randomUUID();
    const dados = { id, local: "armario", tipo: "implantacao", motivo: "Contagem do armário", itens: [{ varianteId: P, contado: 3 }] };
    await registrarContagem(db, mariana, dados);
    const segunda = await registrarContagem(db, mariana, dados);
    expect(segunda.repetido).toBe(true);
    expect(await saldo(P, "armario")).toBe(3);
  });

  it("o ajuste lança só a diferença e guarda o saldo depois", async () => {
    const id = randomUUID();
    await registrarContagem(db, mariana, {
      id,
      local: "farmacia",
      tipo: "ajuste",
      motivo: "Contagem de segunda-feira",
      itens: [
        { varianteId: P, contado: 7 },
        { varianteId: M, contado: 4 }, // igual ao sistema: não gera linha
      ],
    });
    const ms = await db.select().from(movimentacoes).where(eq(movimentacoes.lancamentoId, id));
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({ varianteId: P, quantidade: -3, saldoApos: 7 });
  });

  it("entrada com custo atualiza o custo médio dos três locais", async () => {
    // Antes: P tem 7 (farmácia) + 3 (armário) = 10 a R$ 10,00.
    await registrarContagem(db, mariana, {
      id: randomUUID(),
      local: "consultorio",
      tipo: "implantacao",
      motivo: "Contagem do consultório",
      itens: [{ varianteId: P, contado: 10, custoUnitario: 2000 }],
    });
    expect(await custo(P)).toBe(1500); // (10×10 + 10×20) / 20
  });

  it("recusa negativos, nada a lançar e tamanho repetido", async () => {
    const base = { local: "farmacia", tipo: "ajuste", motivo: "Teste de recusa" };
    await expect(
      registrarContagem(db, mariana, { ...base, id: randomUUID(), itens: [{ varianteId: P, contado: -1 }] }),
    ).rejects.toThrow("negativa");
    await expect(
      registrarContagem(db, mariana, { ...base, id: randomUUID(), itens: [{ varianteId: P, contado: 7 }] }),
    ).rejects.toThrow("Nada a lançar");
    await expect(
      registrarContagem(db, mariana, {
        ...base,
        id: randomUUID(),
        itens: [
          { varianteId: P, contado: 1 },
          { varianteId: P, contado: 2 },
        ],
      }),
    ).rejects.toThrow(ErroCatalogo);
    await expect(
      registrarContagem(db, mariana, { ...base, motivo: "x", id: randomUUID(), itens: [{ varianteId: P, contado: 1 }] }),
    ).rejects.toThrow("motivo");
  });

  it("Eliadna (hospital) vê o estoque mas não ajusta nem vê valores", async () => {
    await expect(
      registrarContagem(db, eliadna, {
        id: randomUUID(),
        local: "farmacia",
        tipo: "ajuste",
        motivo: "Tentativa indevida",
        itens: [{ varianteId: P, contado: 1 }],
      }),
    ).rejects.toThrow(ErroPermissao);
    const { linhas, veValores } = await listarSaldos(db, eliadna);
    expect(veValores).toBe(false);
    const linha = linhas.find((l) => l.varianteId === P)!;
    expect(linha.total).toBe(20);
    expect(linha.custoMedio).toBeNull();
    expect(linha.valor).toBeNull();
    const hist = await listarLancamentos(db, eliadna);
    expect(hist.flatMap((h) => h.itens).every((i) => i.custoUnitario === null)).toBe(true);
  });

  it("Mariana vê os saldos com valor", async () => {
    const { linhas } = await listarSaldos(db, mariana);
    const linha = linhas.find((l) => l.varianteId === P)!;
    expect(linha.porLocal).toEqual({ consultorio: 10, farmacia: 7, armario: 3 });
    expect(linha.valor).toBe(30000);
  });
});

describe("estorno", () => {
  it("desfaz um lançamento e não deixa estornar duas vezes", async () => {
    const original = randomUUID();
    await registrarContagem(db, mariana, {
      id: original,
      local: "armario",
      tipo: "ajuste",
      motivo: "Contagem errada",
      itens: [{ varianteId: M, contado: 9 }],
    });
    expect(await saldo(M, "armario")).toBe(9);

    const estorno = randomUUID();
    await estornarLancamento(db, admin, { id: estorno, lancamentoId: original, motivo: "Digitei errado" });
    expect(await saldo(M, "armario")).toBe(0);
    // Repetir o mesmo envio não faz nada; um novo pedido é recusado.
    expect((await estornarLancamento(db, admin, { id: estorno, lancamentoId: original, motivo: "Digitei errado" })).repetido).toBe(true);
    await expect(
      estornarLancamento(db, admin, { id: randomUUID(), lancamentoId: original, motivo: "De novo" }),
    ).rejects.toThrow("já foi estornado");
    await expect(
      estornarLancamento(db, admin, { id: randomUUID(), lancamentoId: estorno, motivo: "Estornar o estorno" }),
    ).rejects.toThrow("não pode ser estornado");

    const hist = await listarLancamentos(db, mariana, { local: "armario" });
    expect(hist.find((h) => h.id === original)?.estornadoPor).toBe(estorno);
  });

  it("recusa estorno que deixaria saldo negativo", async () => {
    const entrada = randomUUID();
    await registrarContagem(db, mariana, {
      id: entrada,
      local: "armario",
      tipo: "ajuste",
      motivo: "Chegou material",
      itens: [{ varianteId: M, contado: 5 }],
    });
    await registrarContagem(db, mariana, {
      id: randomUUID(),
      local: "armario",
      tipo: "ajuste",
      motivo: "Usado na semana",
      itens: [{ varianteId: M, contado: 2 }],
    });
    await expect(
      estornarLancamento(db, mariana, { id: randomUUID(), lancamentoId: entrada, motivo: "Tentativa" }),
    ).rejects.toThrow("negativo");
  });

  it("estornar uma entrada com custo retira o efeito dela do custo médio", async () => {
    // P: 20 unidades a R$ 15,00. Entram 10 a R$ 30,00 → 30 a R$ 20,00.
    const entrada = randomUUID();
    await registrarContagem(db, mariana, {
      id: entrada,
      local: "consultorio",
      tipo: "ajuste",
      motivo: "Compra nova",
      itens: [{ varianteId: P, contado: 20, custoUnitario: 3000 }],
    });
    expect(await custo(P)).toBe(2000);
    await estornarLancamento(db, mariana, { id: randomUUID(), lancamentoId: entrada, motivo: "Nota lançada em dobro" });
    expect(await custo(P)).toBe(1500);
  });
});

describe("travas do banco", () => {
  it("saldo não muda sem passar pelo livro", async () => {
    expect(await erroDoBanco(db.update(saldos).set({ quantidade: 999 }).where(eq(saldos.varianteId, P)))).toMatch(/livro/i);
    expect(await erroDoBanco(db.insert(saldos).values({ varianteId: M, local: "consultorio", quantidade: 5 }))).toMatch(/livro/i);
    expect(await erroDoBanco(db.delete(saldos).where(eq(saldos.varianteId, P)))).toMatch(/livro|exclu/i);
  });

  it("lançamentos e movimentações não podem ser alterados nem apagados", async () => {
    expect(await erroDoBanco(db.update(movimentacoes).set({ quantidade: 100 }))).toMatch(/não pode|imutáve|alterad/i);
    expect(await erroDoBanco(db.delete(movimentacoes))).toMatch(/não pode|imutáve|alterad/i);
    expect(await erroDoBanco(db.update(lancamentos).set({ motivo: "mudado" }))).toMatch(/não pode|imutáve|alterad/i);
  });

  it("todo saldo é igual à soma do livro", async () => {
    expect(await verificarConsistencia(db)).toHaveLength(0);
  });

  it("dois envios ao mesmo tempo não se atropelam", async () => {
    const antes = await saldo(M, "farmacia");
    await Promise.all(
      [1, 2, 3].map((n) =>
        registrarContagem(db, mariana, {
          id: randomUUID(),
          local: "farmacia",
          tipo: "ajuste",
          motivo: `Contagem simultânea ${n}`,
          itens: [{ varianteId: M, contado: antes + n }],
        }).catch(() => null),
      ),
    );
    expect(await verificarConsistencia(db)).toHaveLength(0);
  });
});
