import { and, desc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { abrirBanco } from "@/db/client";
import { auditoria, historicoPrecos, produtos, variantes } from "@/db/schema";
import {
  adicionarTamanho,
  atualizarProduto,
  criarFornecedor,
  criarProduto,
  definirAtivoTamanho,
  ErroCatalogo,
  ErroPermissao,
  historicoDePrecos,
  listarProdutos,
  obterProduto,
  salvarCondicoes,
  type Ator,
} from "@/lib/catalogo";
import { CATALOGO_INICIAL, carregarCatalogoInicial } from "@/lib/catalogo/carga-inicial";
import { URL_TESTE } from "./preparar-banco";

const { db, fechar } = abrirBanco(URL_TESTE);
afterAll(fechar);

// Atores fictícios: as regras do catálogo conferem o perfil sozinhas.
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

beforeAll(async () => {
  await carregarCatalogoInicial(db);
});

describe("carga inicial dos materiais", () => {
  it("cadastra os 15 materiais e não duplica se rodar de novo", async () => {
    const segunda = await carregarCatalogoInicial(db);
    expect(segunda.criados).toEqual([]);
    expect(segunda.existentes).toHaveLength(CATALOGO_INICIAL.length);
    const [{ n }] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from produtos where nome in ${CATALOGO_INICIAL.map((i) => i.nome)}`,
    );
    expect(n).toBe(15);
  });

  it("estéreis vão para a farmácia e não estéreis para o armário", () => {
    for (const item of CATALOGO_INICIAL) {
      expect(item.localPadrao).toBe(item.esteril ? "farmacia" : "armario");
    }
  });

  it("grades informadas pela equipe", async () => {
    const grade = async (nome: string) =>
      (
        await db
          .select({ nome: variantes.nome })
          .from(variantes)
          .innerJoin(produtos, eq(produtos.id, variantes.produtoId))
          .where(eq(produtos.nome, nome))
          .orderBy(variantes.ordem)
      ).map((v) => v.nome);
    expect(await grade("Sutiã cirúrgico")).toEqual(["PP", "P", "M", "G", "GG"]);
    expect(await grade("Cinta cirúrgica")).toEqual(["PP", "P", "M", "G", "GG"]);
    expect(await grade("Meia de compressão")).toEqual(["P", "M"]);
    expect(await grade("Chinelo")).toEqual(["33/34", "35/36", "37/38", "39/40", "41/42"]);
    expect(await grade("Cânula Klein de infiltração")).toEqual(["Único"]);
  });

  it("a lista mostra os tamanhos e fornecedores de cada produto", async () => {
    const lista = await listarProdutos(db);
    const sutia = lista.find((p) => p.nome === "Sutiã cirúrgico")!;
    expect(sutia.tamanhos).toEqual(["PP", "P", "M", "G", "GG"]);
    expect(lista.find((p) => p.nome === "Ponteira Renuvion")!.tamanhos).toEqual(["Único"]);
    expect(sutia.fornecedores).toBe(0);
  });

  it("a cola é controlada por aplicador", () => {
    expect(CATALOGO_INICIAL.find((i) => i.referencia === "AHV12")?.unidade).toBe("aplicador");
  });
});

describe("cadastro de produtos", () => {
  it("Mariana cadastra; a Eliadna não pode", async () => {
    const id = await criarProduto(db, mariana, {
      nome: "Produto de teste A",
      unidade: "unidade",
      esteril: "nao",
      localPadrao: "armario",
      tamanhos: ["P", "M"],
    });
    const [p] = await db.select().from(produtos).where(eq(produtos.id, id));
    expect(p.codigo).toMatch(/^MAT-\d{4}$/);
    expect(p.esteril).toBe(false);

    await expect(
      criarProduto(db, eliadna, { nome: "Indevido", unidade: "unidade", esteril: "nao" }),
    ).rejects.toThrow(ErroPermissao);
  });

  it("sem tamanhos vira 'Único'; tamanhos repetidos são recusados", async () => {
    const id = await criarProduto(db, admin, { nome: "Produto de teste B", unidade: "rolo", esteril: "a_definir" });
    const vs = await db.select().from(variantes).where(eq(variantes.produtoId, id));
    expect(vs.map((v) => v.nome)).toEqual(["Único"]);
    const [p] = await db.select().from(produtos).where(eq(produtos.id, id));
    expect(p.esteril).toBeNull();

    await expect(
      criarProduto(db, admin, { nome: "Produto C", unidade: "un", esteril: "sim", tamanhos: ["M", "m"] }),
    ).rejects.toThrow("Há tamanhos repetidos.");
    await expect(adicionarTamanho(db, admin, id, { nome: "único" })).rejects.toThrow(/já existe/);
  });

  it("valida os campos com mensagens claras", async () => {
    await expect(criarProduto(db, admin, { nome: "Ab", unidade: "un", esteril: "sim" })).rejects.toThrow(
      "Informe o nome do produto.",
    );
    await expect(criarProduto(db, admin, { nome: "Produto D", unidade: "", esteril: "sim" })).rejects.toThrow(
      /Informe a unidade/,
    );
    await expect(criarProduto(db, admin, { nome: "Produto D", unidade: "un", esteril: "talvez" })).rejects.toThrow(
      ErroCatalogo,
    );
  });

  it("edição registra só o que mudou; salvar sem mudança não gera registro", async () => {
    const id = await criarProduto(db, admin, { nome: "Produto de teste E", unidade: "unidade", esteril: "a_definir" });
    const base = { nome: "Produto de teste E", unidade: "unidade", esteril: "sim", localPadrao: "farmacia" };
    await atualizarProduto(db, mariana, id, base);
    await atualizarProduto(db, mariana, id, base);

    const eventos = await db
      .select()
      .from(auditoria)
      .where(and(eq(auditoria.acao, "produto_alterado"), eq(auditoria.entidadeId, String(id))));
    expect(eventos).toHaveLength(1);
    expect(eventos[0].usuarioId).toBe(mariana.id);
    expect(eventos[0].detalhes).toEqual({
      de: { esteril: null, localPadrao: null },
      para: { esteril: true, localPadrao: "farmacia" },
    });
  });

  it("o último tamanho ativo não pode ser desativado", async () => {
    const id = await criarProduto(db, admin, { nome: "Produto de teste F", unidade: "un", esteril: "nao", tamanhos: ["P", "M"] });
    const [p, m] = await db.select().from(variantes).where(eq(variantes.produtoId, id)).orderBy(variantes.ordem);
    await definirAtivoTamanho(db, admin, p.id, false);
    await expect(definirAtivoTamanho(db, admin, m.id, false)).rejects.toThrow(/pelo menos um tamanho ativo/);
  });

  it("produtos e tamanhos nunca são apagados do banco", async () => {
    const [p] = await db.select().from(produtos).limit(1);
    expect(await erroDoBanco(db.delete(produtos).where(eq(produtos.id, p.id)))).toMatch(/desative o registro/);
    expect(await erroDoBanco(db.delete(variantes).where(eq(variantes.produtoId, p.id)))).toMatch(/desative o registro/);
  });

  it("a busca encontra por nome, fabricante e referência", async () => {
    expect((await listarProdutos(db, { busca: "dermabond" })).map((p) => p.nome)).toEqual([
      "Cola cirúrgica Dermabond High Viscosity",
    ]);
    expect((await listarProdutos(db, { busca: "Biobela" })).length).toBe(2);
    expect((await listarProdutos(db, { busca: "APYX-27" }))[0].nome).toBe("Ponteira Renuvion");
    expect(await listarProdutos(db, { busca: "%" })).toEqual([]);
  });
});

describe("fornecedores, preços e histórico", () => {
  it("nome de fornecedor não se repete (maiúsculas não importam)", async () => {
    await criarFornecedor(db, mariana, { nome: "Distribuidora Teste" });
    await expect(criarFornecedor(db, mariana, { nome: "distribuidora teste" })).rejects.toThrow(/Já existe/);
    await expect(criarFornecedor(db, eliadna, { nome: "Outro" })).rejects.toThrow(ErroPermissao);
    await expect(criarFornecedor(db, mariana, { nome: "Com e-mail ruim", email: "x@" })).rejects.toThrow("E-mail inválido.");
  });

  it("caixa de cola: preço por caixa, conversão por aplicador e histórico a cada mudança", async () => {
    const [cola] = await db.select().from(produtos).where(eq(produtos.referencia, "AHV12"));
    const fornecedorId = await criarFornecedor(db, mariana, { nome: "Fornecedor da cola" });
    const base = {
      produtoId: cola.id,
      fornecedorId,
      embalagem: "caixa",
      unidadesPorEmbalagem: 12,
      precoCentavos: 180000,
      prazoDias: 7,
      loteMinimo: 1,
    };
    const fpId = await salvarCondicoes(db, mariana, base);
    await salvarCondicoes(db, mariana, base); // sem mudança: nada novo
    await salvarCondicoes(db, mariana, { ...base, precoCentavos: 192000 });
    await salvarCondicoes(db, mariana, { ...base, precoCentavos: 192000, codigoNoFornecedor: "X1" }); // não é preço

    const hist = await historicoDePrecos(db, fpId, mariana);
    expect(hist.map((h) => h.precoCentavos)).toEqual([192000, 180000]);
    expect(hist.every((h) => h.unidadesPorEmbalagem === 12 && h.usuarioId === mariana.id)).toBe(true);
  });

  it("a Eliadna vê o produto sem preços e não abre o histórico", async () => {
    const [cola] = await db.select().from(produtos).where(eq(produtos.referencia, "AHV12"));
    const visto = await obterProduto(db, cola.id, eliadna);
    expect(visto.veValores).toBe(false);
    expect(visto.fornecedores.length).toBeGreaterThan(0);
    expect(visto.fornecedores.every((f) => f.precoCentavos === null)).toBe(true);

    const [fp] = await db.execute<{ id: number }>(sql`select id from fornecedor_produtos where produto_id = ${cola.id} limit 1`);
    await expect(historicoDePrecos(db, fp.id, eliadna)).rejects.toThrow(ErroPermissao);
    await expect(
      salvarCondicoes(db, eliadna, { produtoId: cola.id, fornecedorId: 1, embalagem: "caixa", unidadesPorEmbalagem: 12 }),
    ).rejects.toThrow(ErroPermissao);

    const naLista = (await listarProdutos(db, { busca: "dermabond" }))[0];
    expect(naLista.fornecedores).toBeGreaterThanOrEqual(1);

    const daMariana = await obterProduto(db, cola.id, mariana);
    expect(daMariana.fornecedores.some((f) => f.precoCentavos === 192000)).toBe(true);
  });

  it("valores inválidos são recusados", async () => {
    const [cola] = await db.select().from(produtos).where(eq(produtos.referencia, "AHV12"));
    const fornecedorId = await criarFornecedor(db, mariana, { nome: "Fornecedor validação" });
    const base = { produtoId: cola.id, fornecedorId, embalagem: "caixa", unidadesPorEmbalagem: 12 };
    await expect(salvarCondicoes(db, mariana, { ...base, unidadesPorEmbalagem: 0 })).rejects.toThrow(/1 ou mais/);
    await expect(salvarCondicoes(db, mariana, { ...base, precoCentavos: -1 })).rejects.toThrow("Preço inválido.");
    await expect(salvarCondicoes(db, mariana, { ...base, loteMinimo: 0 })).rejects.toThrow(/Lote mínimo/);
  });

  it("o histórico de preços não pode ser alterado nem apagado", async () => {
    const [h] = await db.select().from(historicoPrecos).orderBy(desc(historicoPrecos.id)).limit(1);
    expect(await erroDoBanco(db.update(historicoPrecos).set({ precoCentavos: 1 }).where(eq(historicoPrecos.id, h.id)))).toMatch(
      /imutável/,
    );
    expect(await erroDoBanco(db.delete(historicoPrecos).where(eq(historicoPrecos.id, h.id)))).toMatch(/imutável/);
  });
});
