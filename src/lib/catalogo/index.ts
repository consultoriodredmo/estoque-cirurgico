import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "@/db/auditoria";
import type { Db, Executor } from "@/db/client";
import { fornecedores, fornecedorProdutos, historicoPrecos, locais, produtos, variantes } from "@/db/schema";
import { pode, type Acao, type Perfil } from "../permissoes";

/** Quem está agindo. Toda escrita confere a permissão aqui, além da página. */
export type Ator = { id: string; perfil: Perfil };

/** Erro com mensagem pronta para a tela. */
export class ErroCatalogo extends Error {}
export class ErroPermissao extends ErroCatalogo {
  constructor() {
    super("Você não tem permissão para esta ação.");
  }
}

function autorizar(ator: Ator, acao: Acao) {
  if (!pode(ator.perfil, acao)) throw new ErroPermissao();
}

function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const r = esquema.safeParse(dados);
  if (!r.success) throw new ErroCatalogo(r.error.issues[0]?.message ?? "Dados inválidos.");
  return r.data;
}

/** Diferença campo a campo, para a auditoria guardar só o que mudou. */
function diferenca(antes: Record<string, unknown>, depois: Record<string, unknown>) {
  const de: Record<string, unknown> = {};
  const para: Record<string, unknown> = {};
  for (const k of Object.keys(depois)) {
    if (JSON.stringify(antes[k] ?? null) !== JSON.stringify(depois[k] ?? null)) {
      de[k] = antes[k] ?? null;
      para[k] = depois[k] ?? null;
    }
  }
  return Object.keys(para).length ? { de, para } : null;
}

// ---------------------------------------------------------------------------
// Validação de entrada
// ---------------------------------------------------------------------------

const textoOpcional = z
  .string()
  .trim()
  .max(200)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const ESTERIL = { sim: true, nao: false, a_definir: null } as const;
export type OpcaoEsteril = keyof typeof ESTERIL;

export function esterilParaOpcao(v: boolean | null): OpcaoEsteril {
  return v === true ? "sim" : v === false ? "nao" : "a_definir";
}

const esquemaProduto = z.object({
  nome: z.string().trim().min(3, "Informe o nome do produto.").max(120),
  categoria: textoOpcional,
  fabricante: textoOpcional,
  referencia: textoOpcional,
  unidade: z.string().trim().min(1, "Informe a unidade (ex.: unidade, par, rolo, aplicador).").max(30),
  esteril: z.enum(["sim", "nao", "a_definir"], { error: "Informe se é estéril." }),
  localPadrao: z
    .enum(["consultorio", "farmacia", "armario", ""])
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  observacao: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});

const nomeVariante = z.string().trim().min(1, "Informe o tamanho.").max(40);

const esquemaNovoProduto = esquemaProduto.extend({
  /** Tamanhos. Vazio = produto sem tamanho (variante "Único"). */
  tamanhos: z.array(nomeVariante).max(30).optional().default([]),
});

const esquemaFornecedor = z.object({
  nome: z.string().trim().min(2, "Informe o nome do fornecedor.").max(120),
  cnpj: textoOpcional,
  contato: textoOpcional,
  telefone: textoOpcional,
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable()
    .transform((v) => (v ? v.toLowerCase() : null))
    .pipe(z.email("E-mail inválido.").nullable()),
  observacao: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});

const inteiroOpcional = (msg: string, minimo: number) =>
  z
    .number()
    .int(msg)
    .min(minimo, msg)
    .optional()
    .nullable()
    .transform((v) => (v == null ? null : v));

const esquemaVinculo = z.object({
  produtoId: z.number().int().positive(),
  fornecedorId: z.number().int().positive(),
  embalagem: z.string().trim().min(1, "Informe a embalagem (ex.: unidade, caixa).").max(40),
  unidadesPorEmbalagem: z.number().int().min(1, "Unidades por embalagem deve ser 1 ou mais."),
  precoCentavos: inteiroOpcional("Preço inválido.", 0),
  prazoDias: inteiroOpcional("Prazo inválido.", 0),
  loteMinimo: inteiroOpcional("Lote mínimo deve ser 1 ou mais.", 1),
  codigoNoFornecedor: textoOpcional,
});

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export async function listarLocais(db: Db) {
  return db.select().from(locais).orderBy(asc(locais.ordem));
}

export type ResumoProduto = {
  id: number;
  codigo: string;
  nome: string;
  categoria: string | null;
  fabricante: string | null;
  esteril: boolean | null;
  localPadrao: string | null;
  ativo: boolean;
  tamanhos: string[];
  fornecedores: number;
};

export async function listarProdutos(
  db: Db,
  filtro: { busca?: string; incluirInativos?: boolean } = {},
): Promise<ResumoProduto[]> {
  const condicoes = [];
  if (!filtro.incluirInativos) condicoes.push(eq(produtos.ativo, true));
  const busca = filtro.busca?.trim();
  if (busca) {
    const termo = `%${busca.replace(/[%_\\]/g, "\\$&")}%`;
    condicoes.push(
      or(
        ilike(produtos.nome, termo),
        ilike(produtos.codigo, termo),
        ilike(produtos.fabricante, termo),
        ilike(produtos.referencia, termo),
        ilike(produtos.categoria, termo),
      )!,
    );
  }
  const linhas = await db
    .select({
      id: produtos.id,
      codigo: produtos.codigo,
      nome: produtos.nome,
      categoria: produtos.categoria,
      fabricante: produtos.fabricante,
      esteril: produtos.esteril,
      localPadrao: produtos.localPadrao,
      ativo: produtos.ativo,
      tamanhos: sql<string[]>`coalesce((
        select array_agg(v.nome order by v.ordem, v.id) from variantes v
        where v.produto_id = "produtos"."id" and v.ativo), '{}')`,
      fornecedores: sql<number>`(
        select count(*)::int from fornecedor_produtos fp
        where fp.produto_id = "produtos"."id" and fp.ativo)`,
    })
    .from(produtos)
    .where(condicoes.length ? and(...condicoes) : undefined)
    .orderBy(asc(produtos.categoria), asc(produtos.nome));
  return linhas;
}

export type DetalheProduto = Awaited<ReturnType<typeof obterProduto>>;

/**
 * Produto completo. Preços e histórico só vão para quem pode ver valores
 * (decisão 6: a Eliadna não vê custos).
 */
export async function obterProduto(db: Db, id: number, ator: Ator) {
  autorizar(ator, "produtos:ver");
  const [produto] = await db.select().from(produtos).where(eq(produtos.id, id));
  if (!produto) throw new ErroCatalogo("Produto não encontrado.");
  const tamanhos = await db
    .select()
    .from(variantes)
    .where(eq(variantes.produtoId, id))
    .orderBy(asc(variantes.ordem), asc(variantes.id));
  const vinculos = await db
    .select({
      id: fornecedorProdutos.id,
      fornecedorId: fornecedorProdutos.fornecedorId,
      fornecedor: fornecedores.nome,
      embalagem: fornecedorProdutos.embalagem,
      unidadesPorEmbalagem: fornecedorProdutos.unidadesPorEmbalagem,
      precoCentavos: fornecedorProdutos.precoCentavos,
      prazoDias: fornecedorProdutos.prazoDias,
      loteMinimo: fornecedorProdutos.loteMinimo,
      codigoNoFornecedor: fornecedorProdutos.codigoNoFornecedor,
      ativo: fornecedorProdutos.ativo,
    })
    .from(fornecedorProdutos)
    .innerJoin(fornecedores, eq(fornecedores.id, fornecedorProdutos.fornecedorId))
    .where(eq(fornecedorProdutos.produtoId, id))
    .orderBy(asc(fornecedores.nome));

  const veValores = pode(ator.perfil, "valores:ver");
  return {
    produto,
    tamanhos,
    veValores,
    fornecedores: vinculos.map((v) => (veValores ? v : { ...v, precoCentavos: null })),
  };
}

export async function historicoDePrecos(db: Db, fornecedorProdutoId: number, ator: Ator) {
  autorizar(ator, "valores:ver");
  return db
    .select()
    .from(historicoPrecos)
    .where(eq(historicoPrecos.fornecedorProdutoId, fornecedorProdutoId))
    .orderBy(desc(historicoPrecos.em), desc(historicoPrecos.id));
}

export async function listarFornecedores(db: Db, incluirInativos = false) {
  return db
    .select()
    .from(fornecedores)
    .where(incluirInativos ? undefined : eq(fornecedores.ativo, true))
    .orderBy(asc(fornecedores.nome));
}

// ---------------------------------------------------------------------------
// Produtos e tamanhos
// ---------------------------------------------------------------------------

/** Próximo código interno MAT-0001, MAT-0002… */
async function proximoCodigo(tx: Executor): Promise<string> {
  const [r] = await tx.execute<{ n: number }>(
    sql`select coalesce(max(substring(codigo from '^MAT-(\\d+)$')::int), 0) + 1 as n from produtos`,
  );
  return `MAT-${String(r.n).padStart(4, "0")}`;
}

export async function criarProduto(db: Db, ator: Ator, dados: unknown): Promise<number> {
  autorizar(ator, "produtos:editar");
  const novo = validar(esquemaNovoProduto, dados);
  const nomesTamanho = novo.tamanhos.length ? novo.tamanhos : ["Único"];
  if (new Set(nomesTamanho.map((t) => t.toLowerCase())).size !== nomesTamanho.length) {
    throw new ErroCatalogo("Há tamanhos repetidos.");
  }

  return db.transaction(async (tx) => {
    const codigo = await proximoCodigo(tx);
    const { esteril, nome, categoria, fabricante, referencia, unidade, localPadrao, observacao } = novo;
    const campos = { nome, categoria, fabricante, referencia, unidade, localPadrao, observacao };
    const [criado] = await tx
      .insert(produtos)
      .values({ ...campos, codigo, esteril: ESTERIL[esteril] })
      .returning({ id: produtos.id });
    await tx
      .insert(variantes)
      .values(nomesTamanho.map((nome, ordem) => ({ produtoId: criado.id, nome, ordem })));
    await registrarAuditoria(tx, {
      acao: "produto_criado",
      usuarioId: ator.id,
      entidade: "produto",
      entidadeId: String(criado.id),
      detalhes: { codigo, nome: novo.nome, tamanhos: nomesTamanho },
    });
    return criado.id;
  });
}

export async function atualizarProduto(db: Db, ator: Ator, id: number, dados: unknown): Promise<void> {
  autorizar(ator, "produtos:editar");
  const novo = validar(esquemaProduto, dados);
  await db.transaction(async (tx) => {
    const [antes] = await tx.select().from(produtos).where(eq(produtos.id, id)).for("update");
    if (!antes) throw new ErroCatalogo("Produto não encontrado.");
    const depois = { ...novo, esteril: ESTERIL[novo.esteril] };
    const mudanca = diferenca(antes, depois);
    if (!mudanca) return;
    await tx.update(produtos).set({ ...depois, atualizadoEm: new Date() }).where(eq(produtos.id, id));
    await registrarAuditoria(tx, {
      acao: "produto_alterado",
      usuarioId: ator.id,
      entidade: "produto",
      entidadeId: String(id),
      detalhes: mudanca,
    });
  });
}

export async function definirAtivoProduto(db: Db, ator: Ator, id: number, ativo: boolean): Promise<void> {
  autorizar(ator, "produtos:editar");
  await db.transaction(async (tx) => {
    const [antes] = await tx.select().from(produtos).where(eq(produtos.id, id));
    if (!antes) throw new ErroCatalogo("Produto não encontrado.");
    if (antes.ativo === ativo) return;
    await tx.update(produtos).set({ ativo, atualizadoEm: new Date() }).where(eq(produtos.id, id));
    await registrarAuditoria(tx, {
      acao: ativo ? "produto_reativado" : "produto_desativado",
      usuarioId: ator.id,
      entidade: "produto",
      entidadeId: String(id),
    });
  });
}

export async function adicionarTamanho(
  db: Db,
  ator: Ator,
  produtoId: number,
  dados: { nome: unknown; codigoBarras?: unknown },
): Promise<number> {
  autorizar(ator, "produtos:editar");
  const nome = validar(nomeVariante, dados.nome);
  const codigoBarras = validar(textoOpcional, dados.codigoBarras);
  return db.transaction(async (tx) => {
    const existentes = await tx.select().from(variantes).where(eq(variantes.produtoId, produtoId));
    if (!existentes.length) throw new ErroCatalogo("Produto não encontrado.");
    if (existentes.some((v) => v.nome.toLowerCase() === nome.toLowerCase())) {
      throw new ErroCatalogo(`O tamanho "${nome}" já existe neste produto.`);
    }
    const ordem = Math.max(...existentes.map((v) => v.ordem)) + 1;
    const [criado] = await tx
      .insert(variantes)
      .values({ produtoId, nome, codigoBarras, ordem })
      .returning({ id: variantes.id });
    await registrarAuditoria(tx, {
      acao: "tamanho_criado",
      usuarioId: ator.id,
      entidade: "produto",
      entidadeId: String(produtoId),
      detalhes: { tamanho: nome },
    });
    return criado.id;
  });
}

export async function atualizarTamanho(
  db: Db,
  ator: Ator,
  varianteId: number,
  dados: { nome: unknown; codigoBarras?: unknown },
): Promise<void> {
  autorizar(ator, "produtos:editar");
  const nome = validar(nomeVariante, dados.nome);
  const codigoBarras = validar(textoOpcional, dados.codigoBarras);
  await db.transaction(async (tx) => {
    const [antes] = await tx.select().from(variantes).where(eq(variantes.id, varianteId));
    if (!antes) throw new ErroCatalogo("Tamanho não encontrado.");
    const irmaos = await tx.select().from(variantes).where(eq(variantes.produtoId, antes.produtoId));
    if (irmaos.some((v) => v.id !== varianteId && v.nome.toLowerCase() === nome.toLowerCase())) {
      throw new ErroCatalogo(`O tamanho "${nome}" já existe neste produto.`);
    }
    const mudanca = diferenca(antes, { nome, codigoBarras });
    if (!mudanca) return;
    await tx.update(variantes).set({ nome, codigoBarras }).where(eq(variantes.id, varianteId));
    await registrarAuditoria(tx, {
      acao: "tamanho_alterado",
      usuarioId: ator.id,
      entidade: "produto",
      entidadeId: String(antes.produtoId),
      detalhes: mudanca,
    });
  });
}

export async function definirAtivoTamanho(db: Db, ator: Ator, varianteId: number, ativo: boolean): Promise<void> {
  autorizar(ator, "produtos:editar");
  await db.transaction(async (tx) => {
    const [alvo] = await tx.select().from(variantes).where(eq(variantes.id, varianteId));
    if (!alvo) throw new ErroCatalogo("Tamanho não encontrado.");
    if (alvo.ativo === ativo) return;
    if (!ativo) {
      const ativos = await tx
        .select({ id: variantes.id })
        .from(variantes)
        .where(and(eq(variantes.produtoId, alvo.produtoId), eq(variantes.ativo, true)));
      if (ativos.length <= 1) {
        throw new ErroCatalogo("O produto precisa de pelo menos um tamanho ativo. Desative o produto, se for o caso.");
      }
    }
    await tx.update(variantes).set({ ativo }).where(eq(variantes.id, varianteId));
    await registrarAuditoria(tx, {
      acao: ativo ? "tamanho_reativado" : "tamanho_desativado",
      usuarioId: ator.id,
      entidade: "produto",
      entidadeId: String(alvo.produtoId),
      detalhes: { tamanho: alvo.nome },
    });
  });
}

// ---------------------------------------------------------------------------
// Fornecedores e condições de compra
// ---------------------------------------------------------------------------

export async function criarFornecedor(db: Db, ator: Ator, dados: unknown): Promise<number> {
  autorizar(ator, "fornecedores:editar");
  const novo = validar(esquemaFornecedor, dados);
  return db.transaction(async (tx) => {
    const [existe] = await tx
      .select({ id: fornecedores.id })
      .from(fornecedores)
      .where(sql`lower(${fornecedores.nome}) = lower(${novo.nome})`);
    if (existe) throw new ErroCatalogo("Já existe um fornecedor com esse nome.");
    const [criado] = await tx.insert(fornecedores).values(novo).returning({ id: fornecedores.id });
    await registrarAuditoria(tx, {
      acao: "fornecedor_criado",
      usuarioId: ator.id,
      entidade: "fornecedor",
      entidadeId: String(criado.id),
      detalhes: { nome: novo.nome },
    });
    return criado.id;
  });
}

export async function atualizarFornecedor(db: Db, ator: Ator, id: number, dados: unknown): Promise<void> {
  autorizar(ator, "fornecedores:editar");
  const novo = validar(esquemaFornecedor, dados);
  await db.transaction(async (tx) => {
    const [antes] = await tx.select().from(fornecedores).where(eq(fornecedores.id, id));
    if (!antes) throw new ErroCatalogo("Fornecedor não encontrado.");
    const [homonimo] = await tx
      .select({ id: fornecedores.id })
      .from(fornecedores)
      .where(and(sql`lower(${fornecedores.nome}) = lower(${novo.nome})`, sql`${fornecedores.id} <> ${id}`));
    if (homonimo) throw new ErroCatalogo("Já existe um fornecedor com esse nome.");
    const mudanca = diferenca(antes, novo);
    if (!mudanca) return;
    await tx.update(fornecedores).set(novo).where(eq(fornecedores.id, id));
    await registrarAuditoria(tx, {
      acao: "fornecedor_alterado",
      usuarioId: ator.id,
      entidade: "fornecedor",
      entidadeId: String(id),
      detalhes: mudanca,
    });
  });
}

export async function definirAtivoFornecedor(db: Db, ator: Ator, id: number, ativo: boolean): Promise<void> {
  autorizar(ator, "fornecedores:editar");
  await db.transaction(async (tx) => {
    const [antes] = await tx.select().from(fornecedores).where(eq(fornecedores.id, id));
    if (!antes) throw new ErroCatalogo("Fornecedor não encontrado.");
    if (antes.ativo === ativo) return;
    await tx.update(fornecedores).set({ ativo }).where(eq(fornecedores.id, id));
    await registrarAuditoria(tx, {
      acao: ativo ? "fornecedor_reativado" : "fornecedor_desativado",
      usuarioId: ator.id,
      entidade: "fornecedor",
      entidadeId: String(id),
    });
  });
}

/**
 * Cria ou atualiza as condições de um fornecedor para um produto. Toda
 * mudança de preço, prazo ou embalagem entra no histórico (só inclusão).
 */
export async function salvarCondicoes(db: Db, ator: Ator, dados: unknown): Promise<number> {
  autorizar(ator, "fornecedores:editar");
  autorizar(ator, "custos:editar");
  const c = validar(esquemaVinculo, dados);
  return db.transaction(async (tx) => {
    const [prod] = await tx.select({ id: produtos.id }).from(produtos).where(eq(produtos.id, c.produtoId));
    if (!prod) throw new ErroCatalogo("Produto não encontrado.");
    const [forn] = await tx
      .select({ id: fornecedores.id, ativo: fornecedores.ativo })
      .from(fornecedores)
      .where(eq(fornecedores.id, c.fornecedorId));
    if (!forn) throw new ErroCatalogo("Fornecedor não encontrado.");

    const [antes] = await tx
      .select()
      .from(fornecedorProdutos)
      .where(and(eq(fornecedorProdutos.produtoId, c.produtoId), eq(fornecedorProdutos.fornecedorId, c.fornecedorId)))
      .for("update");

    const valores = {
      embalagem: c.embalagem,
      unidadesPorEmbalagem: c.unidadesPorEmbalagem,
      precoCentavos: c.precoCentavos,
      prazoDias: c.prazoDias,
      loteMinimo: c.loteMinimo,
      codigoNoFornecedor: c.codigoNoFornecedor,
    };

    let id: number;
    let mudanca: ReturnType<typeof diferenca>;
    if (antes) {
      id = antes.id;
      mudanca = diferenca(antes, { ...valores, ativo: true });
      if (!mudanca) return id;
      await tx
        .update(fornecedorProdutos)
        .set({ ...valores, ativo: true, atualizadoEm: new Date() })
        .where(eq(fornecedorProdutos.id, id));
    } else {
      const [criado] = await tx
        .insert(fornecedorProdutos)
        .values({ produtoId: c.produtoId, fornecedorId: c.fornecedorId, ...valores })
        .returning({ id: fornecedorProdutos.id });
      id = criado.id;
      mudanca = { de: {}, para: valores };
    }

    const precoMudou =
      !antes ||
      antes.precoCentavos !== c.precoCentavos ||
      antes.prazoDias !== c.prazoDias ||
      antes.unidadesPorEmbalagem !== c.unidadesPorEmbalagem;
    if (precoMudou) {
      await tx.insert(historicoPrecos).values({
        fornecedorProdutoId: id,
        precoCentavos: c.precoCentavos,
        prazoDias: c.prazoDias,
        unidadesPorEmbalagem: c.unidadesPorEmbalagem,
        origem: "cadastro",
        usuarioId: ator.id,
      });
    }
    await registrarAuditoria(tx, {
      acao: antes ? "condicoes_alteradas" : "fornecedor_vinculado",
      usuarioId: ator.id,
      entidade: "fornecedor_produto",
      entidadeId: String(id),
      detalhes: { produtoId: c.produtoId, fornecedorId: c.fornecedorId, ...mudanca },
    });
    return id;
  });
}

export async function desvincularFornecedor(db: Db, ator: Ator, fornecedorProdutoId: number): Promise<void> {
  autorizar(ator, "fornecedores:editar");
  await db.transaction(async (tx) => {
    const [antes] = await tx.select().from(fornecedorProdutos).where(eq(fornecedorProdutos.id, fornecedorProdutoId));
    if (!antes) throw new ErroCatalogo("Vínculo não encontrado.");
    if (!antes.ativo) return;
    await tx
      .update(fornecedorProdutos)
      .set({ ativo: false, atualizadoEm: new Date() })
      .where(eq(fornecedorProdutos.id, fornecedorProdutoId));
    await registrarAuditoria(tx, {
      acao: "fornecedor_desvinculado",
      usuarioId: ator.id,
      entidade: "fornecedor_produto",
      entidadeId: String(fornecedorProdutoId),
      detalhes: { produtoId: antes.produtoId, fornecedorId: antes.fornecedorId },
    });
  });
}
