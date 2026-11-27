import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "@/db/auditoria";
import type { Db } from "@/db/client";
import { cirurgiaProcedimentos, cirurgias, procedimentos, produtos, regraItens, regrasKit, variantes } from "@/db/schema";
import { ErroCatalogo, ErroPermissao, type Ator } from "../catalogo";
import { pode } from "../permissoes";
import { calcularPrevisao, GRUPOS, LISTA_GRUPOS, type Grupo, type Pendencia, type ProcedimentoMarcado, type RegraMotor } from "./motor";

export { GRUPOS, LISTA_GRUPOS, type Grupo } from "./motor";

function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const r = esquema.safeParse(dados);
  if (!r.success) throw new ErroCatalogo(r.error.issues[0]?.message ?? "Dados inválidos.");
  return r.data;
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export type RegraCompleta = Omit<RegraMotor, "itens"> & { itens: { produtoId: number; quantidade: number; produto: string; unidade: string }[] };

export async function carregarRegras(db: Db, apenasAtivas = false): Promise<RegraCompleta[]> {
  const rs = await db
    .select()
    .from(regrasKit)
    .where(apenasAtivas ? eq(regrasKit.ativo, true) : undefined)
    .orderBy(asc(regrasKit.grupo), sql`${regrasKit.prioridade} desc`, asc(regrasKit.id));
  if (!rs.length) return [];
  const itens = await db
    .select({ regraId: regraItens.regraId, produtoId: regraItens.produtoId, quantidade: regraItens.quantidade, produto: produtos.nome, unidade: produtos.unidade })
    .from(regraItens)
    .innerJoin(produtos, eq(produtos.id, regraItens.produtoId))
    .where(inArray(regraItens.regraId, rs.map((r) => r.id)))
    .orderBy(asc(produtos.nome));
  return rs.map((r) => ({
    id: r.id,
    grupo: r.grupo,
    descricao: r.descricao,
    todos: r.todos,
    algum: r.algum,
    nenhum: r.nenhum,
    somente: r.somente,
    prioridade: r.prioridade,
    provisoria: r.provisoria,
    ativo: r.ativo,
    itens: itens.filter((i) => i.regraId === r.id).map(({ produtoId, quantidade, produto, unidade }) => ({ produtoId, quantidade, produto, unidade })),
  }));
}

export type LinhaPrevista = {
  produtoId: number;
  produto: string;
  unidade: string;
  localPadrao: string | null;
  quantidade: number;
  provisoria: boolean;
  grupos: Grupo[];
  /** "Tamanho na confirmação", o tamanho informado (chinelo) ou null se o produto não tem tamanhos. */
  tamanho: string | null;
};

export type PrevisaoCompleta = {
  linhas: LinhaPrevista[];
  aplicadas: { grupo: Grupo; nomeGrupo: string; regraId: number; descricao: string; provisoria: boolean; semItens: boolean }[];
  pendencias: (Pendencia & { nomeGrupo: string })[];
};

/** Calcula a previsão para um conjunto de procedimentos (usado na cirurgia e no simulador). */
export async function preverMateriais(
  db: Db,
  marcados: ProcedimentoMarcado[],
  opcoes: { regras?: RegraCompleta[]; chineloVarianteId?: number | null } = {},
): Promise<PrevisaoCompleta> {
  const regras = opcoes.regras ?? (await carregarRegras(db, true));
  const p = calcularPrevisao(marcados, regras);
  const ids = p.itens.map((i) => i.produtoId);
  const info = ids.length
    ? await db
        .select({
          id: produtos.id,
          nome: produtos.nome,
          unidade: produtos.unidade,
          localPadrao: produtos.localPadrao,
          tamanhos: sql<number>`(select count(*)::int from variantes v where v.produto_id = "produtos"."id" and v.ativo)`,
        })
        .from(produtos)
        .where(inArray(produtos.id, ids))
    : [];
  let chinelo: { produtoId: number; nome: string } | null = null;
  if (opcoes.chineloVarianteId) {
    const [v] = await db
      .select({ produtoId: variantes.produtoId, nome: variantes.nome })
      .from(variantes)
      .where(eq(variantes.id, opcoes.chineloVarianteId));
    chinelo = v ?? null;
  }
  const linhas: LinhaPrevista[] = p.itens
    .map((i) => {
      const prod = info.find((x) => x.id === i.produtoId)!;
      let tamanho: string | null = null;
      if (chinelo && chinelo.produtoId === i.produtoId) tamanho = chinelo.nome;
      else if (prod.tamanhos > 1) tamanho = "tamanho na confirmação";
      return { produtoId: i.produtoId, produto: prod.nome, unidade: prod.unidade, localPadrao: prod.localPadrao, quantidade: i.quantidade, provisoria: i.provisoria, grupos: i.grupos, tamanho };
    })
    .sort((a, b) => LISTA_GRUPOS.indexOf(a.grupos[0]) - LISTA_GRUPOS.indexOf(b.grupos[0]) || a.produto.localeCompare(b.produto));
  return {
    linhas,
    aplicadas: p.aplicadas.map((a) => ({
      grupo: a.grupo,
      nomeGrupo: GRUPOS[a.grupo].nome,
      regraId: a.regra.id,
      descricao: a.regra.descricao,
      provisoria: a.regra.provisoria,
      semItens: a.regra.itens.length === 0,
    })),
    pendencias: p.pendencias.map((x) => ({ ...x, nomeGrupo: GRUPOS[x.grupo].nome })),
  };
}

async function procedimentosDe(db: Db, cirurgiaIds: number[]) {
  if (!cirurgiaIds.length) return new Map<number, ProcedimentoMarcado[]>();
  const linhas = await db
    .select({ cirurgiaId: cirurgiaProcedimentos.cirurgiaId, codigo: procedimentos.codigo, tipo: procedimentos.tipo })
    .from(cirurgiaProcedimentos)
    .innerJoin(procedimentos, eq(procedimentos.codigo, cirurgiaProcedimentos.procedimento))
    .where(inArray(cirurgiaProcedimentos.cirurgiaId, cirurgiaIds));
  const mapa = new Map<number, ProcedimentoMarcado[]>();
  for (const l of linhas) mapa.set(l.cirurgiaId, [...(mapa.get(l.cirurgiaId) ?? []), { codigo: l.codigo, tipo: l.tipo }]);
  return mapa;
}

export async function previsaoDaCirurgia(db: Db, ator: Ator, cirurgiaId: number): Promise<PrevisaoCompleta> {
  if (!pode(ator.perfil, "cirurgias:ver")) throw new ErroPermissao();
  const [c] = await db.select({ chinelo: cirurgias.chineloVarianteId }).from(cirurgias).where(eq(cirurgias.id, cirurgiaId));
  if (!c) throw new ErroCatalogo("Cirurgia não encontrada.");
  const marcados = (await procedimentosDe(db, [cirurgiaId])).get(cirurgiaId) ?? [];
  return preverMateriais(db, marcados, { chineloVarianteId: c.chinelo });
}

/** Quantas pendências de regra cada cirurgia tem (para a lista da semana). */
export async function pendenciasPorCirurgia(db: Db, cirurgiaIds: number[]): Promise<Map<number, number>> {
  const regras = await carregarRegras(db, true);
  const procs = await procedimentosDe(db, cirurgiaIds);
  return new Map(cirurgiaIds.map((id) => [id, calcularPrevisao(procs.get(id) ?? [], regras).pendencias.length]));
}

// ---------------------------------------------------------------------------
// Cadastro e edição (administrador)
// ---------------------------------------------------------------------------

const lista = z.array(z.string().min(1)).default([]);
const esquemaRegra = z
  .object({
    grupo: z.enum(LISTA_GRUPOS as [Grupo, ...Grupo[]], { error: "Escolha o grupo." }),
    descricao: z.string().trim().min(5, "Descreva a regra (ex.: Abdominoplastia isolada: 2 aplicadores).").max(200),
    todos: lista,
    algum: lista,
    nenhum: lista,
    somente: z.boolean().default(false),
    prioridade: z.number().int().min(0).max(1000).default(10),
    provisoria: z.boolean().default(false),
    itens: z
      .array(z.object({ produtoId: z.number().int().positive(), quantidade: z.number().int("Use números inteiros.").positive("A quantidade deve ser maior que zero.") }))
      .default([]),
  })
  .refine((r) => new Set(r.itens.map((i) => i.produtoId)).size === r.itens.length, "Um material apareceu duas vezes.")
  .refine((r) => !r.todos.some((c) => r.nenhum.includes(c)) && !r.algum.some((c) => r.nenhum.includes(c)), "Um procedimento não pode ser exigido e proibido ao mesmo tempo.");

async function conferirReferencias(db: Db, r: z.infer<typeof esquemaRegra>) {
  const codigos = [...new Set([...r.todos, ...r.algum, ...r.nenhum])];
  if (codigos.length) {
    const achados = await db.select({ c: procedimentos.codigo }).from(procedimentos).where(inArray(procedimentos.codigo, codigos));
    if (achados.length !== codigos.length) throw new ErroCatalogo("Algum procedimento da regra não existe.");
  }
  if (r.itens.length) {
    const ids = r.itens.map((i) => i.produtoId);
    const achados = await db.select({ id: produtos.id }).from(produtos).where(inArray(produtos.id, ids));
    if (achados.length !== ids.length) throw new ErroCatalogo("Algum material da regra não existe.");
  }
}

function resumo(r: z.infer<typeof esquemaRegra>) {
  return { ...r, todos: [...r.todos].sort(), algum: [...r.algum].sort(), nenhum: [...r.nenhum].sort() };
}

export async function criarRegra(db: Db, ator: Ator, dados: unknown): Promise<number> {
  if (!pode(ator.perfil, "regras:editar")) throw new ErroPermissao();
  const r = validar(esquemaRegra, dados);
  await conferirReferencias(db, r);
  return db.transaction(async (tx) => {
    const { itens, ...campos } = r;
    const [nova] = await tx.insert(regrasKit).values(campos).returning({ id: regrasKit.id });
    if (itens.length) await tx.insert(regraItens).values(itens.map((i) => ({ regraId: nova.id, ...i })));
    await registrarAuditoria(tx, { acao: "regra_criada", usuarioId: ator.id, entidade: "regra_kit", entidadeId: String(nova.id), detalhes: resumo(r) });
    return nova.id;
  });
}

export async function atualizarRegra(db: Db, ator: Ator, id: number, dados: unknown): Promise<void> {
  if (!pode(ator.perfil, "regras:editar")) throw new ErroPermissao();
  const r = validar(esquemaRegra, dados);
  await conferirReferencias(db, r);
  await db.transaction(async (tx) => {
    const [antes] = await tx.select().from(regrasKit).where(eq(regrasKit.id, id));
    if (!antes) throw new ErroCatalogo("Regra não encontrada.");
    const itensAntes = await tx.select({ produtoId: regraItens.produtoId, quantidade: regraItens.quantidade }).from(regraItens).where(eq(regraItens.regraId, id));
    const { itens, ...campos } = r;
    await tx.update(regrasKit).set({ ...campos, atualizadoEm: new Date() }).where(eq(regrasKit.id, id));
    await tx.delete(regraItens).where(eq(regraItens.regraId, id));
    if (itens.length) await tx.insert(regraItens).values(itens.map((i) => ({ regraId: id, ...i })));
    await registrarAuditoria(tx, {
      acao: "regra_alterada",
      usuarioId: ator.id,
      entidade: "regra_kit",
      entidadeId: String(id),
      detalhes: {
        antes: { grupo: antes.grupo, descricao: antes.descricao, todos: antes.todos, algum: antes.algum, nenhum: antes.nenhum, somente: antes.somente, prioridade: antes.prioridade, provisoria: antes.provisoria, itens: itensAntes },
        depois: resumo(r),
      },
    });
  });
}

export async function definirAtivoRegra(db: Db, ator: Ator, id: number, ativo: boolean): Promise<void> {
  if (!pode(ator.perfil, "regras:editar")) throw new ErroPermissao();
  await db.transaction(async (tx) => {
    const r = await tx.update(regrasKit).set({ ativo, atualizadoEm: new Date() }).where(eq(regrasKit.id, id)).returning({ id: regrasKit.id });
    if (!r.length) throw new ErroCatalogo("Regra não encontrada.");
    await registrarAuditoria(tx, { acao: ativo ? "regra_reativada" : "regra_desativada", usuarioId: ator.id, entidade: "regra_kit", entidadeId: String(id) });
  });
}

// ---------------------------------------------------------------------------
// Regras iniciais: especificação (seção 5) + respostas do Edmo (23 e 27/11/2026)
// ---------------------------------------------------------------------------

const LIPO = ["abdominoplastia", "lipoaspiracao", "lipoescultura_enxerto"];
const MAMA = ["protese_mama", "mamoplastia_protese", "mamoplastia"];
const FACELIFT = ["facelift_v1", "facelift_v2", "facelift_v3", "facelift_v4", "facelift_v5"];

type Inicial = {
  grupo: Grupo;
  descricao: string;
  todos?: string[];
  algum?: string[];
  nenhum?: string[];
  somente?: boolean;
  prioridade?: number;
  provisoria?: boolean;
  itens: [string, number][];
};

export const REGRAS_INICIAIS: Inicial[] = [
  {
    grupo: "kit_vibrolipo",
    descricao: "Abdominoplastia, lipoaspiração ou lipoescultura: 1 kit por paciente, mesmo em cirurgia combinada",
    algum: LIPO,
    itens: [["Cânula Klein de infiltração", 1], ["Cânula de 9 furos para vibrolipo", 1], ["Mangueira de infiltração", 1], ["Mangueira de propulsão de duas vias", 1]],
  },
  { grupo: "viaro", descricao: "Lipoescultura com enxerto: 1 Viaro além do kit", todos: ["lipoescultura_enxerto"], itens: [["Cânula Viaro Arms Ugraft reta", 1]] },
  {
    grupo: "canula_azul",
    descricao: "Lipo axilar sem kit vibrolipo: 1 cânula azul (com kit, o kit já atende)",
    todos: ["lipo_axilar"],
    nenhum: LIPO,
    itens: [["Cânula azul manual reta de 3 furos", 1]],
  },
  { grupo: "renuvion", descricao: "Renuvion: 1 ponteira", todos: ["renuvion"], itens: [["Ponteira Renuvion", 1]] },
  { grupo: "cola", descricao: "Prótese de mama isolada: 1 aplicador", todos: ["protese_mama"], somente: true, itens: [["Cola cirúrgica Dermabond High Viscosity", 1]] },
  { grupo: "cola", descricao: "Mamoplastia redutora isolada: 3 aplicadores", todos: ["mamoplastia"], somente: true, itens: [["Cola cirúrgica Dermabond High Viscosity", 3]] },
  { grupo: "cola", descricao: "Mamoplastia redutora + abdominoplastia: 5 aplicadores no total", todos: ["mamoplastia", "abdominoplastia"], somente: true, itens: [["Cola cirúrgica Dermabond High Viscosity", 5]] },
  { grupo: "cola", descricao: "Prótese de mama + abdominoplastia: 5 aplicadores", todos: ["protese_mama", "abdominoplastia"], somente: true, itens: [["Cola cirúrgica Dermabond High Viscosity", 5]] },
  { grupo: "cola", descricao: "Abdominoplastia isolada: 2 aplicadores", todos: ["abdominoplastia"], somente: true, provisoria: true, itens: [["Cola cirúrgica Dermabond High Viscosity", 2]] },
  { grupo: "cola", descricao: "Lipoaspiração isolada: 1 aplicador", todos: ["lipoaspiracao"], somente: true, itens: [["Cola cirúrgica Dermabond High Viscosity", 1]] },
  { grupo: "cola", descricao: "Mamoplastia redutora + lipoaspiração: 4 aplicadores (3 + 1)", todos: ["mamoplastia", "lipoaspiracao"], somente: true, itens: [["Cola cirúrgica Dermabond High Viscosity", 4]] },
  { grupo: "cola", descricao: "Facelifting (qualquer número de vetores): 2 aplicadores", algum: FACELIFT, somente: true, itens: [["Cola cirúrgica Dermabond High Viscosity", 2]] },
  { grupo: "cola", descricao: "Blefaroplastia: não usa cola", todos: ["blefaroplastia"], somente: true, itens: [] },
  { grupo: "cola", descricao: "Rinoplastia: não usa cola", todos: ["rinoplastia"], somente: true, itens: [] },
  { grupo: "compressiva", descricao: "Cirurgia mamária isolada: 2 sutiãs (pós-operatório imediato e alta)", algum: MAMA, somente: true, itens: [["Sutiã cirúrgico", 2]] },
  {
    grupo: "compressiva",
    descricao: "Abdominoplastia ou lipo, isolada ou combinada: 2 cintas (imediato e dia seguinte); sem sutiãs",
    algum: LIPO,
    prioridade: 20,
    itens: [["Cinta cirúrgica", 2]],
  },
  { grupo: "meia", descricao: "Abdominoplastia ou lipo: 1 par (na mamoplastia, só como item extra)", algum: LIPO, itens: [["Meia de compressão", 1]] },
  { grupo: "acolhimento", descricao: "Toda paciente: robe, bolsa e chinelo", itens: [["Robe/avental personalizado", 1], ["Bolsa personalizada", 1], ["Chinelo", 1]] },
];

/** Carrega as regras iniciais só se ainda não houver nenhuma. Devolve materiais não encontrados. */
export async function carregarRegrasIniciais(db: Db): Promise<{ criadas: number; faltando: string[] }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('regras_iniciais'))`);
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(regrasKit);
    if (n > 0) return { criadas: 0, faltando: [] };
    const nomes = [...new Set(REGRAS_INICIAIS.flatMap((r) => r.itens.map(([nome]) => nome)))];
    const prods = await tx.select({ id: produtos.id, nome: produtos.nome }).from(produtos).where(and(inArray(produtos.nome, nomes)));
    const id = new Map(prods.map((p) => [p.nome, p.id]));
    const faltando = nomes.filter((nome) => !id.has(nome));
    let criadas = 0;
    for (const r of REGRAS_INICIAIS) {
      if (r.itens.some(([nome]) => !id.has(nome))) continue;
      const [nova] = await tx
        .insert(regrasKit)
        .values({
          grupo: r.grupo,
          descricao: r.descricao,
          todos: r.todos ?? [],
          algum: r.algum ?? [],
          nenhum: r.nenhum ?? [],
          somente: r.somente ?? false,
          prioridade: r.prioridade ?? 10,
          provisoria: r.provisoria ?? false,
        })
        .returning({ id: regrasKit.id });
      if (r.itens.length) await tx.insert(regraItens).values(r.itens.map(([nome, quantidade]) => ({ regraId: nova.id, produtoId: id.get(nome)!, quantidade })));
      criadas++;
    }
    await registrarAuditoria(tx, { acao: "regras_iniciais_carregadas", entidade: "regra_kit", detalhes: { criadas, faltando } });
    return { criadas, faltando };
  });
}
