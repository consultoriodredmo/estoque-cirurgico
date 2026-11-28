import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "@/db/auditoria";
import type { Db } from "@/db/client";
import { cirurgias, custosMedios, lancamentos, movimentacoes, produtos, saldos, user, variantes } from "@/db/schema";
import { ErroCatalogo, ErroPermissao, type Ator } from "../catalogo";
import { estornarLancamento, LOCAIS, type Local, type ResultadoLancamento } from "../estoque";
import { pode } from "../permissoes";

function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const r = esquema.safeParse(dados);
  if (!r.success) throw new ErroCatalogo(r.error.issues[0]?.message ?? "Dados inválidos.");
  return r.data;
}

/** Materiais e tamanhos ativos, com saldo por local (só quantidades: a Eliadna não vê valores). */
export async function materiaisParaConsumo(db: Db) {
  const linhas = await db
    .select({
      produtoId: produtos.id,
      produto: produtos.nome,
      unidade: produtos.unidade,
      localPadrao: produtos.localPadrao,
      varianteId: variantes.id,
      tamanho: variantes.nome,
    })
    .from(variantes)
    .innerJoin(produtos, eq(produtos.id, variantes.produtoId))
    .where(and(eq(produtos.ativo, true), eq(variantes.ativo, true)))
    .orderBy(asc(produtos.nome), asc(variantes.ordem), asc(variantes.id));
  const ss = await db.select().from(saldos);
  const mapa = new Map<number, { id: number; nome: string; unidade: string; localPadrao: string | null; tamanhos: { id: number; nome: string; saldo: Record<Local, number> }[] }>();
  for (const l of linhas) {
    const p = mapa.get(l.produtoId) ?? { id: l.produtoId, nome: l.produto, unidade: l.unidade, localPadrao: l.localPadrao, tamanhos: [] };
    const saldo = { consultorio: 0, farmacia: 0, armario: 0 } as Record<Local, number>;
    for (const s of ss) if (s.varianteId === l.varianteId) saldo[s.local as Local] = s.quantidade;
    p.tamanhos.push({ id: l.varianteId, nome: l.tamanho, saldo });
    mapa.set(l.produtoId, p);
  }
  return [...mapa.values()];
}

const esquemaConsumo = z.object({
  id: z.uuid({ error: "Identificador inválido. Recarregue a página." }),
  cirurgiaId: z.number().int().positive(),
  observacao: z.string().trim().max(300).nullable().optional(),
  linhas: z
    .array(
      z.object({
        varianteId: z.number({ error: "Escolha o tamanho." }).int().positive("Escolha o tamanho."),
        local: z.enum(LOCAIS, { error: "Escolha o local." }),
        quantidade: z.number({ error: "Quantidade inválida." }).int("Use números inteiros.").min(0, "Quantidade não pode ser negativa."),
      }),
    )
    .max(200),
});

export type Excecao = { produto: string; tamanho: string; local: string; saldoApos: number };
export type ResultadoConsumo = ResultadoLancamento & { excecoes: Excecao[] };

/**
 * Confirma o consumo de uma cirurgia: baixa cada tamanho do local informado,
 * numa única transação. Uma cirurgia só tem um consumo ativo (baixa dupla é recusada).
 * Saldo insuficiente não bloqueia (decisão do Edmo): a baixa entra e fica como exceção.
 */
export async function registrarConsumo(db: Db, ator: Ator, dados: unknown): Promise<ResultadoConsumo> {
  if (!pode(ator.perfil, "consumo:confirmar")) throw new ErroPermissao();
  const c = validar(esquemaConsumo, dados);

  // Junta linhas repetidas do mesmo tamanho e local; ignora quantidade zero.
  const soma = new Map<string, { varianteId: number; local: Local; quantidade: number }>();
  for (const l of c.linhas) {
    if (l.quantidade === 0) continue;
    const k = `${l.varianteId}|${l.local}`;
    const atual = soma.get(k) ?? { varianteId: l.varianteId, local: l.local, quantidade: 0 };
    atual.quantidade += l.quantidade;
    soma.set(k, atual);
  }
  const linhas = [...soma.values()];
  if (!linhas.length) throw new ErroCatalogo("Informe pelo menos um material usado.");

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('estoque'))`);
    const [ja] = await tx.select({ id: lancamentos.id }).from(lancamentos).where(eq(lancamentos.id, c.id));
    if (ja) return { repetido: true, linhas: 0, excecoes: [] };

    const [cir] = await tx.select().from(cirurgias).where(eq(cirurgias.id, c.cirurgiaId)).for("update");
    if (!cir) throw new ErroCatalogo("Cirurgia não encontrada.");
    if (cir.situacao === "consumo_confirmado") throw new ErroCatalogo("O consumo desta cirurgia já foi confirmado.");
    if (cir.situacao === "cancelada") throw new ErroCatalogo("A cirurgia está cancelada.");

    const ids = [...new Set(linhas.map((l) => l.varianteId))];
    const vs = await tx
      .select({ id: variantes.id, ativo: variantes.ativo, produtoAtivo: produtos.ativo })
      .from(variantes)
      .innerJoin(produtos, eq(produtos.id, variantes.produtoId))
      .where(inArray(variantes.id, ids));
    if (vs.length !== ids.length || vs.some((v) => !v.ativo || !v.produtoAtivo)) {
      throw new ErroCatalogo("Algum material ou tamanho não existe mais. Recarregue a página.");
    }
    const custos = await tx.select().from(custosMedios).where(inArray(custosMedios.varianteId, ids));

    await tx.insert(lancamentos).values({
      id: c.id,
      tipo: "consumo",
      local: null,
      motivo: c.observacao ? `Consumo da cirurgia — ${c.observacao}` : "Consumo da cirurgia",
      usuarioId: ator.id,
      cirurgiaId: c.cirurgiaId,
    });
    for (const l of linhas) {
      await tx.insert(movimentacoes).values({
        lancamentoId: c.id,
        varianteId: l.varianteId,
        local: l.local,
        quantidade: -l.quantidade,
        saldoApos: 0, // calculado pelo banco
        // Custo aplicado a este consumo (custo médio do momento), para o custo por cirurgia.
        custoUnitario: custos.find((x) => x.varianteId === l.varianteId)?.custo ?? null,
      });
    }
    await tx.update(cirurgias).set({ situacao: "consumo_confirmado", atualizadoEm: new Date() }).where(eq(cirurgias.id, c.cirurgiaId));

    const excecoes = await tx
      .select({ produto: produtos.nome, tamanho: variantes.nome, local: movimentacoes.local, saldoApos: movimentacoes.saldoApos })
      .from(movimentacoes)
      .innerJoin(variantes, eq(variantes.id, movimentacoes.varianteId))
      .innerJoin(produtos, eq(produtos.id, variantes.produtoId))
      .where(and(eq(movimentacoes.lancamentoId, c.id), sql`${movimentacoes.saldoApos} < 0`));

    await registrarAuditoria(tx, {
      acao: "consumo_confirmado",
      usuarioId: ator.id,
      entidade: "cirurgia",
      entidadeId: String(c.cirurgiaId),
      detalhes: { lancamento: c.id, linhas: linhas.length, excecoes: excecoes.length },
    });
    return { repetido: false, linhas: linhas.length, excecoes };
  });
}

export type ConsumoRegistrado = {
  lancamentoId: string;
  usuario: string;
  em: Date;
  motivo: string;
  itens: { produto: string; tamanho: string; local: string; quantidade: number; saldoApos: number; custoUnitario: number | null }[];
};

/** O consumo ativo (não estornado) da cirurgia, se houver. */
export async function consumoDaCirurgia(db: Db, ator: Ator, cirurgiaId: number): Promise<ConsumoRegistrado | null> {
  if (!pode(ator.perfil, "cirurgias:ver")) throw new ErroPermissao();
  const [l] = await db
    .select({ id: lancamentos.id, usuario: user.name, em: lancamentos.em, motivo: lancamentos.motivo })
    .from(lancamentos)
    .leftJoin(user, eq(user.id, lancamentos.usuarioId))
    .where(
      and(
        eq(lancamentos.cirurgiaId, cirurgiaId),
        eq(lancamentos.tipo, "consumo"),
        sql`${lancamentos.id} not in (select estorno_de from lancamentos where estorno_de is not null)`,
      ),
    )
    .orderBy(desc(lancamentos.em))
    .limit(1);
  if (!l) return null;
  const veValores = pode(ator.perfil, "valores:ver");
  const itens = await db
    .select({
      produto: produtos.nome,
      tamanho: variantes.nome,
      local: movimentacoes.local,
      quantidade: movimentacoes.quantidade,
      saldoApos: movimentacoes.saldoApos,
      custo: movimentacoes.custoUnitario,
    })
    .from(movimentacoes)
    .innerJoin(variantes, eq(variantes.id, movimentacoes.varianteId))
    .innerJoin(produtos, eq(produtos.id, variantes.produtoId))
    .where(eq(movimentacoes.lancamentoId, l.id))
    .orderBy(asc(produtos.nome), asc(variantes.ordem));
  return {
    lancamentoId: l.id,
    usuario: l.usuario ?? "—",
    em: l.em,
    motivo: l.motivo,
    itens: itens.map((i) => ({
      produto: i.produto,
      tamanho: i.tamanho,
      local: i.local,
      quantidade: -i.quantidade,
      saldoApos: i.saldoApos,
      custoUnitario: veValores && i.custo != null ? Number(i.custo) : null,
    })),
  };
}

/** Desfaz a confirmação: estorna o consumo e a cirurgia volta a aguardar confirmação. */
export async function desfazerConsumo(db: Db, ator: Ator, dados: { id: unknown; cirurgiaId: number; motivo: unknown }) {
  if (!pode(ator.perfil, "consumo:confirmar") && !pode(ator.perfil, "ajuste:fazer")) throw new ErroPermissao();
  const atual = await consumoDaCirurgia(db, ator, dados.cirurgiaId);
  if (!atual) {
    // Pode ser um reenvio do mesmo pedido: o estorno já foi feito.
    const [ja] = typeof dados.id === "string" ? await db.select({ id: lancamentos.id }).from(lancamentos).where(eq(lancamentos.id, dados.id)) : [];
    if (ja) return { repetido: true, linhas: 0 };
    throw new ErroCatalogo("Esta cirurgia não tem consumo confirmado.");
  }
  return estornarLancamento(db, ator, { id: dados.id, lancamentoId: atual.lancamentoId, motivo: dados.motivo });
}
