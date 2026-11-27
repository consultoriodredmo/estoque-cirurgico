import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "@/db/auditoria";
import type { Db, Tx } from "@/db/client";
import { custosMedios, lancamentos, locais, movimentacoes, produtos, saldos, user, variantes } from "@/db/schema";
import { ErroCatalogo, ErroPermissao, type Ator } from "../catalogo";
import { pode, type Acao } from "../permissoes";

export const LOCAIS = ["consultorio", "farmacia", "armario"] as const;
export type Local = (typeof LOCAIS)[number];

export const NOME_TIPO: Record<string, string> = {
  implantacao: "Carga inicial",
  ajuste: "Ajuste por contagem",
  estorno: "Estorno",
};

function autorizar(ator: Ator, acao: Acao) {
  if (!pode(ator.perfil, acao)) throw new ErroPermissao();
}

function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const r = esquema.safeParse(dados);
  if (!r.success) throw new ErroCatalogo(r.error.issues[0]?.message ?? "Dados inválidos.");
  return r.data;
}

/** Todas as escritas de estoque passam uma de cada vez (três usuários: custo zero). */
async function travarEstoque(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('estoque'))`);
}

const idLancamento = z.uuid({ error: "Identificador do lançamento inválido. Recarregue a página." });

const esquemaContagem = z.object({
  id: idLancamento,
  local: z.enum(LOCAIS, { error: "Escolha o local." }),
  tipo: z.enum(["implantacao", "ajuste"], { error: "Escolha o tipo de lançamento." }),
  motivo: z.string().trim().min(5, "Descreva o motivo (pelo menos 5 letras).").max(500),
  itens: z
    .array(
      z.object({
        varianteId: z.number().int().positive(),
        contado: z.number({ error: "Quantidade inválida." }).int("Use números inteiros.").min(0, "A quantidade não pode ser negativa."),
        /** Custo unitário em centavos, opcional. */
        custoUnitario: z.number().int().min(0, "Custo inválido.").nullable().optional(),
      }),
    )
    .min(1, "Informe pelo menos uma quantidade contada."),
});

export type ResultadoLancamento = { repetido: boolean; linhas: number };

function paraNumero(v: unknown): number | null {
  return v == null ? null : Number(v);
}

/** Atualiza o custo médio ponderado de um tamanho, somando os três locais. */
async function aplicarCustoMedio(tx: Tx, varianteId: number, qtdAntes: number, delta: number, custoUnit: number) {
  const [atual] = await tx.select().from(custosMedios).where(eq(custosMedios.varianteId, varianteId));
  const custoAtual = paraNumero(atual?.custo);
  const qtdDepois = qtdAntes + delta;
  let novo: number | null;
  if (delta > 0) {
    novo = custoAtual == null || qtdAntes <= 0 ? custoUnit : (qtdAntes * custoAtual + delta * custoUnit) / qtdDepois;
  } else {
    // Desfazer uma entrada (estorno): retira o efeito dela, se ainda sobrar estoque.
    novo = custoAtual == null || qtdDepois <= 0 ? custoAtual : (qtdAntes * custoAtual + delta * custoUnit) / qtdDepois;
  }
  if (novo == null) return;
  const valor = novo.toFixed(4);
  await tx
    .insert(custosMedios)
    .values({ varianteId, custo: valor })
    .onConflictDoUpdate({ target: custosMedios.varianteId, set: { custo: valor, atualizadoEm: new Date() } });
}

async function totalPorVariante(tx: Tx, ids: number[]): Promise<Map<number, number>> {
  if (!ids.length) return new Map();
  const linhas = await tx
    .select({ varianteId: saldos.varianteId, total: sql<number>`sum(${saldos.quantidade})::int` })
    .from(saldos)
    .where(inArray(saldos.varianteId, ids))
    .groupBy(saldos.varianteId);
  return new Map(linhas.map((l) => [l.varianteId, l.total]));
}

/**
 * Carga inicial ou ajuste por contagem física de um local: para cada tamanho
 * informado, lança a diferença entre o contado e o saldo do sistema.
 * Enviar o mesmo formulário de novo (mesmo id) não duplica.
 */
export async function registrarContagem(db: Db, ator: Ator, dados: unknown): Promise<ResultadoLancamento> {
  autorizar(ator, "ajuste:fazer");
  const c = validar(esquemaContagem, dados);
  const ids = c.itens.map((i) => i.varianteId);
  if (new Set(ids).size !== ids.length) throw new ErroCatalogo("Um mesmo tamanho apareceu duas vezes.");
  if (c.itens.some((i) => i.custoUnitario != null) && !pode(ator.perfil, "custos:editar")) throw new ErroPermissao();

  return db.transaction(async (tx) => {
    await travarEstoque(tx);
    const [ja] = await tx.select({ id: lancamentos.id }).from(lancamentos).where(eq(lancamentos.id, c.id));
    if (ja) return { repetido: true, linhas: 0 };

    const existentes = await tx.select({ id: variantes.id }).from(variantes).where(inArray(variantes.id, ids));
    if (existentes.length !== ids.length) throw new ErroCatalogo("Algum tamanho informado não existe mais. Recarregue a página.");

    const atuais = await tx
      .select({ varianteId: saldos.varianteId, quantidade: saldos.quantidade })
      .from(saldos)
      .where(and(eq(saldos.local, c.local), inArray(saldos.varianteId, ids)));
    const saldoLocal = new Map(atuais.map((a) => [a.varianteId, a.quantidade]));
    const totais = await totalPorVariante(tx, ids);

    const linhas = c.itens
      .map((i) => ({ ...i, delta: i.contado - (saldoLocal.get(i.varianteId) ?? 0) }))
      .filter((i) => i.delta !== 0);
    if (!linhas.length) throw new ErroCatalogo("As quantidades informadas são iguais ao saldo do sistema. Nada a lançar.");

    await tx.insert(lancamentos).values({ id: c.id, tipo: c.tipo, local: c.local, motivo: c.motivo, usuarioId: ator.id });
    for (const l of linhas) {
      const custo = l.delta > 0 && l.custoUnitario != null ? l.custoUnitario : null;
      await tx.insert(movimentacoes).values({
        lancamentoId: c.id,
        varianteId: l.varianteId,
        local: c.local,
        quantidade: l.delta,
        saldoApos: 0, // calculado pelo banco
        custoUnitario: custo == null ? null : String(custo),
      });
      if (custo != null) await aplicarCustoMedio(tx, l.varianteId, totais.get(l.varianteId) ?? 0, l.delta, custo);
    }
    await registrarAuditoria(tx, {
      acao: "estoque_lancamento",
      usuarioId: ator.id,
      entidade: "lancamento",
      entidadeId: c.id,
      detalhes: { tipo: c.tipo, local: c.local, linhas: linhas.length },
    });
    return { repetido: false, linhas: linhas.length };
  });
}

const esquemaEstorno = z.object({
  id: idLancamento,
  lancamentoId: z.string().min(1),
  motivo: z.string().trim().min(5, "Descreva o motivo do estorno (pelo menos 5 letras).").max(500),
});

/** Desfaz um lançamento criando outro, com as quantidades invertidas. */
export async function estornarLancamento(db: Db, ator: Ator, dados: unknown): Promise<ResultadoLancamento> {
  autorizar(ator, "ajuste:fazer");
  const e = validar(esquemaEstorno, dados);
  return db.transaction(async (tx) => {
    await travarEstoque(tx);
    const [ja] = await tx.select({ id: lancamentos.id }).from(lancamentos).where(eq(lancamentos.id, e.id));
    if (ja) return { repetido: true, linhas: 0 };

    const [original] = await tx.select().from(lancamentos).where(eq(lancamentos.id, e.lancamentoId));
    if (!original) throw new ErroCatalogo("Lançamento não encontrado.");
    if (original.tipo === "estorno") throw new ErroCatalogo("Um estorno não pode ser estornado. Faça um ajuste por contagem.");
    const [estornoAnterior] = await tx.select({ id: lancamentos.id }).from(lancamentos).where(eq(lancamentos.estornoDe, original.id));
    if (estornoAnterior) throw new ErroCatalogo("Este lançamento já foi estornado.");

    const itens = await tx.select().from(movimentacoes).where(eq(movimentacoes.lancamentoId, original.id));
    const ids = [...new Set(itens.map((i) => i.varianteId))];
    const atuais = await tx.select().from(saldos).where(inArray(saldos.varianteId, ids));
    const saldoDe = (v: number, l: string) => atuais.find((a) => a.varianteId === v && a.local === l)?.quantidade ?? 0;
    for (const i of itens) {
      if (saldoDe(i.varianteId, i.local) - i.quantidade < 0) {
        const [nome] = await tx
          .select({ produto: produtos.nome, tamanho: variantes.nome })
          .from(variantes)
          .innerJoin(produtos, eq(produtos.id, variantes.produtoId))
          .where(eq(variantes.id, i.varianteId));
        throw new ErroCatalogo(
          `O estorno deixaria o saldo negativo em ${nome.produto} (${nome.tamanho}). Faça um ajuste por contagem.`,
        );
      }
    }
    const totais = await totalPorVariante(tx, ids);

    await tx.insert(lancamentos).values({
      id: e.id,
      tipo: "estorno",
      local: original.local,
      motivo: e.motivo,
      usuarioId: ator.id,
      estornoDe: original.id,
    });
    for (const i of itens) {
      await tx.insert(movimentacoes).values({
        lancamentoId: e.id,
        varianteId: i.varianteId,
        local: i.local,
        quantidade: -i.quantidade,
        saldoApos: 0,
        custoUnitario: i.custoUnitario,
      });
      const custo = paraNumero(i.custoUnitario);
      if (custo != null && i.quantidade > 0) {
        await aplicarCustoMedio(tx, i.varianteId, totais.get(i.varianteId) ?? 0, -i.quantidade, custo);
        totais.set(i.varianteId, (totais.get(i.varianteId) ?? 0) - i.quantidade);
      }
    }
    await registrarAuditoria(tx, {
      acao: "estoque_estorno",
      usuarioId: ator.id,
      entidade: "lancamento",
      entidadeId: e.id,
      detalhes: { estornoDe: original.id },
    });
    return { repetido: false, linhas: itens.length };
  });
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export type LinhaSaldo = {
  varianteId: number;
  produtoId: number;
  produto: string;
  categoria: string | null;
  tamanho: string;
  unidade: string;
  localPadrao: string | null;
  porLocal: Record<Local, number>;
  total: number;
  /** Só para quem pode ver valores. */
  custoMedio: number | null;
  valor: number | null;
};

/** Saldos de todos os tamanhos ativos (e de qualquer um que ainda tenha estoque). */
export async function listarSaldos(db: Db, ator: Ator): Promise<{ linhas: LinhaSaldo[]; veValores: boolean }> {
  autorizar(ator, "estoque:ver");
  const veValores = pode(ator.perfil, "valores:ver");
  const vs = await db
    .select({
      varianteId: variantes.id,
      produtoId: produtos.id,
      produto: produtos.nome,
      categoria: produtos.categoria,
      tamanho: variantes.nome,
      unidade: produtos.unidade,
      localPadrao: produtos.localPadrao,
      ativo: sql<boolean>`${produtos.ativo} and ${variantes.ativo}`,
      custo: custosMedios.custo,
    })
    .from(variantes)
    .innerJoin(produtos, eq(produtos.id, variantes.produtoId))
    .leftJoin(custosMedios, eq(custosMedios.varianteId, variantes.id))
    .orderBy(asc(produtos.categoria), asc(produtos.nome), asc(variantes.ordem), asc(variantes.id));
  const ss = await db.select().from(saldos);
  const mapa = new Map<number, Record<Local, number>>();
  for (const s of ss) {
    const r = mapa.get(s.varianteId) ?? { consultorio: 0, farmacia: 0, armario: 0 };
    r[s.local as Local] = s.quantidade;
    mapa.set(s.varianteId, r);
  }
  const linhas: LinhaSaldo[] = [];
  for (const v of vs) {
    const porLocal = mapa.get(v.varianteId) ?? { consultorio: 0, farmacia: 0, armario: 0 };
    const total = porLocal.consultorio + porLocal.farmacia + porLocal.armario;
    if (!v.ativo && total === 0) continue;
    const custo = paraNumero(v.custo);
    linhas.push({
      varianteId: v.varianteId,
      produtoId: v.produtoId,
      produto: v.produto,
      categoria: v.categoria,
      tamanho: v.tamanho,
      unidade: v.unidade,
      localPadrao: v.localPadrao,
      porLocal,
      total,
      custoMedio: veValores ? custo : null,
      valor: veValores && custo != null ? Math.round(custo * total) : null,
    });
  }
  return { linhas, veValores };
}

export type ItemLancamento = { produto: string; tamanho: string; quantidade: number; saldoApos: number; custoUnitario: number | null };
export type ResumoLancamento = {
  id: string;
  tipo: string;
  local: string | null;
  motivo: string;
  usuario: string;
  em: Date;
  estornoDe: string | null;
  estornadoPor: string | null;
  itens: ItemLancamento[];
};

export async function listarLancamentos(
  db: Db,
  ator: Ator,
  filtro: { local?: string; limite?: number } = {},
): Promise<ResumoLancamento[]> {
  autorizar(ator, "estoque:ver");
  const veValores = pode(ator.perfil, "valores:ver");
  const local = LOCAIS.includes(filtro.local as Local) ? (filtro.local as Local) : undefined;
  const cab = await db
    .select({
      id: lancamentos.id,
      tipo: lancamentos.tipo,
      local: lancamentos.local,
      motivo: lancamentos.motivo,
      usuario: user.name,
      em: lancamentos.em,
      estornoDe: lancamentos.estornoDe,
    })
    .from(lancamentos)
    .leftJoin(user, eq(user.id, lancamentos.usuarioId))
    .where(local ? eq(lancamentos.local, local) : undefined)
    .orderBy(desc(lancamentos.em))
    .limit(Math.min(filtro.limite ?? 50, 200));
  if (!cab.length) return [];
  const ids = cab.map((c) => c.id);
  const itens = await db
    .select({
      lancamentoId: movimentacoes.lancamentoId,
      produto: produtos.nome,
      tamanho: variantes.nome,
      quantidade: movimentacoes.quantidade,
      saldoApos: movimentacoes.saldoApos,
      custoUnitario: movimentacoes.custoUnitario,
    })
    .from(movimentacoes)
    .innerJoin(variantes, eq(variantes.id, movimentacoes.varianteId))
    .innerJoin(produtos, eq(produtos.id, variantes.produtoId))
    .where(inArray(movimentacoes.lancamentoId, ids))
    .orderBy(asc(produtos.nome), asc(variantes.ordem));
  const estornos = await db
    .select({ id: lancamentos.id, de: lancamentos.estornoDe })
    .from(lancamentos)
    .where(inArray(lancamentos.estornoDe, ids));
  return cab.map((c) => ({
    ...c,
    usuario: c.usuario ?? "—",
    estornadoPor: estornos.find((e) => e.de === c.id)?.id ?? null,
    itens: itens
      .filter((i) => i.lancamentoId === c.id)
      .map((i) => ({
        produto: i.produto,
        tamanho: i.tamanho,
        quantidade: i.quantidade,
        saldoApos: i.saldoApos,
        custoUnitario: veValores ? paraNumero(i.custoUnitario) : null,
      })),
  }));
}

/** Confere se cada saldo é igual à soma do livro. Lista vazia = tudo certo. */
export async function verificarConsistencia(db: Db) {
  return db.execute<{ variante_id: number; local: string; saldo: number; livro: number }>(sql`
    select coalesce(s.variante_id, m.variante_id) as variante_id, coalesce(s.local, m.local) as local,
           coalesce(s.quantidade, 0) as saldo, coalesce(m.total, 0)::int as livro
    from saldos s
    full join (select variante_id, local, sum(quantidade) as total from movimentacoes group by 1, 2) m
      on m.variante_id = s.variante_id and m.local = s.local
    where coalesce(s.quantidade, 0) <> coalesce(m.total, 0)`);
}

export async function nomesLocais(db: Db) {
  return db.select().from(locais).orderBy(asc(locais.ordem));
}
