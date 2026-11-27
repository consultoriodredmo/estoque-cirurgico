import { and, asc, eq, gte, ilike, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "@/db/auditoria";
import type { Db, Executor } from "@/db/client";
import { cirurgiaProcedimentos, cirurgias, procedimentos, produtos, variantes } from "@/db/schema";
import { ErroCatalogo, ErroPermissao, type Ator } from "../catalogo";
import { pode, type Acao } from "../permissoes";

export const NOME_SITUACAO: Record<string, string> = {
  agendada: "Agendada",
  cancelada: "Cancelada",
  consumo_confirmado: "Consumo confirmado",
};

function autorizar(ator: Ator, acao: Acao) {
  if (!pode(ator.perfil, acao)) throw new ErroPermissao();
}

function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const r = esquema.safeParse(dados);
  if (!r.success) throw new ErroCatalogo(r.error.issues[0]?.message ?? "Dados inválidos.");
  return r.data;
}

// ---------------------------------------------------------------------------
// Datas (fuso de São Paulo; semana de segunda a domingo)
// ---------------------------------------------------------------------------

export function hojeSP(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

function dataValida(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Segunda e domingo da semana que contém a data. */
export function semanaDe(data: string): { inicio: string; fim: string } {
  const diaSemana = new Date(`${data}T12:00:00Z`).getUTCDay(); // 0 = domingo
  const inicio = somarDias(data, diaSemana === 0 ? -6 : 1 - diaSemana);
  return { inicio, fim: somarDias(inicio, 6) };
}

// ---------------------------------------------------------------------------
// Procedimentos
// ---------------------------------------------------------------------------

export async function listarProcedimentos(db: Db, incluirInativos = false) {
  return db
    .select()
    .from(procedimentos)
    .where(incluirInativos ? undefined : eq(procedimentos.ativo, true))
    .orderBy(asc(procedimentos.tipo), asc(procedimentos.ordem), asc(procedimentos.nome));
}

function paraCodigo(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

const esquemaProcedimento = z.object({
  nome: z.string().trim().min(3, "Informe o nome do procedimento.").max(80),
  tipo: z.enum(["procedimento", "tecnologia"], { error: "Escolha procedimento ou tecnologia." }),
});

export async function criarProcedimento(db: Db, ator: Ator, dados: unknown): Promise<string> {
  autorizar(ator, "regras:editar");
  const p = validar(esquemaProcedimento, dados);
  const codigo = paraCodigo(p.nome);
  if (!codigo) throw new ErroCatalogo("Nome inválido.");
  return db.transaction(async (tx) => {
    const [mesmo] = await tx
      .select({ codigo: procedimentos.codigo })
      .from(procedimentos)
      .where(eq(procedimentos.codigo, codigo));
    const [mesmoNome] = await tx.select({ codigo: procedimentos.codigo }).from(procedimentos).where(ilike(procedimentos.nome, p.nome));
    if (mesmo || mesmoNome) throw new ErroCatalogo("Já existe um procedimento com esse nome.");
    await tx.insert(procedimentos).values({ codigo, nome: p.nome, tipo: p.tipo, ordem: 50 });
    await registrarAuditoria(tx, {
      acao: "procedimento_criado",
      usuarioId: ator.id,
      entidade: "procedimento",
      entidadeId: codigo,
      detalhes: { nome: p.nome, tipo: p.tipo },
    });
    return codigo;
  });
}

export async function definirAtivoProcedimento(db: Db, ator: Ator, codigo: string, ativo: boolean): Promise<void> {
  autorizar(ator, "regras:editar");
  await db.transaction(async (tx) => {
    const r = await tx.update(procedimentos).set({ ativo }).where(eq(procedimentos.codigo, codigo)).returning();
    if (!r.length) throw new ErroCatalogo("Procedimento não encontrado.");
    await registrarAuditoria(tx, {
      acao: ativo ? "procedimento_reativado" : "procedimento_desativado",
      usuarioId: ator.id,
      entidade: "procedimento",
      entidadeId: codigo,
    });
  });
}

// ---------------------------------------------------------------------------
// Cirurgias
// ---------------------------------------------------------------------------

const esquemaCirurgia = z.object({
  paciente: z
    .string()
    .trim()
    .min(5, "Informe o nome completo da paciente.")
    .max(150)
    .refine((n) => n.split(/\s+/).length >= 2, "Informe nome e sobrenome da paciente."),
  data: z.string().refine(dataValida, "Data inválida."),
  hora: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (use 07:30).")
    .nullable()
    .optional(),
  procedimentos: z.array(z.string().min(1)).min(1, "Marque pelo menos um procedimento."),
  chineloVarianteId: z.number().int().positive().nullable().optional(),
  observacao: z.string().trim().max(300, "Observação longa demais.").nullable().optional(),
});

async function conferirReferencias(db: Db, c: z.infer<typeof esquemaCirurgia>) {
  const codigos = [...new Set(c.procedimentos)];
  const ativos = await db
    .select({ codigo: procedimentos.codigo })
    .from(procedimentos)
    .where(and(inArray(procedimentos.codigo, codigos), eq(procedimentos.ativo, true)));
  if (ativos.length !== codigos.length) throw new ErroCatalogo("Algum procedimento marcado não existe ou foi desativado.");
  if (c.chineloVarianteId != null) {
    const [v] = await db
      .select({ id: variantes.id })
      .from(variantes)
      .innerJoin(produtos, eq(produtos.id, variantes.produtoId))
      .where(and(eq(variantes.id, c.chineloVarianteId), eq(variantes.ativo, true), ilike(produtos.nome, "%chinelo%")));
    if (!v) throw new ErroCatalogo("Tamanho de chinelo inválido.");
  }
  return codigos;
}

/** O que vai para a auditoria: nunca o nome da paciente (LGPD). */
function resumoAuditavel(c: { data: string; hora?: string | null; procedimentos: string[]; chineloVarianteId?: number | null }) {
  return { data: c.data, hora: c.hora ?? null, procedimentos: [...c.procedimentos].sort(), chinelo: c.chineloVarianteId ?? null };
}

export async function criarCirurgia(db: Db, ator: Ator, dados: unknown): Promise<number> {
  autorizar(ator, "cirurgias:editar");
  const c = validar(esquemaCirurgia, dados);
  const codigos = await conferirReferencias(db, c);
  return db.transaction(async (tx) => {
    const [nova] = await tx
      .insert(cirurgias)
      .values({
        paciente: c.paciente.replace(/\s+/g, " "),
        data: c.data,
        hora: c.hora ?? null,
        chineloVarianteId: c.chineloVarianteId ?? null,
        observacao: c.observacao || null,
        criadoPor: ator.id,
      })
      .returning({ id: cirurgias.id });
    await tx.insert(cirurgiaProcedimentos).values(codigos.map((procedimento) => ({ cirurgiaId: nova.id, procedimento })));
    await registrarAuditoria(tx, {
      acao: "cirurgia_criada",
      usuarioId: ator.id,
      entidade: "cirurgia",
      entidadeId: String(nova.id),
      detalhes: resumoAuditavel({ ...c, procedimentos: codigos }),
    });
    return nova.id;
  });
}

async function carregarParaEdicao(db: Executor, id: number) {
  const [atual] = await db.select().from(cirurgias).where(eq(cirurgias.id, id));
  if (!atual) throw new ErroCatalogo("Cirurgia não encontrada.");
  if (atual.situacao === "consumo_confirmado") {
    throw new ErroCatalogo("O consumo desta cirurgia já foi confirmado; ela não pode mais ser alterada.");
  }
  return atual;
}

export async function atualizarCirurgia(db: Db, ator: Ator, id: number, dados: unknown): Promise<void> {
  autorizar(ator, "cirurgias:editar");
  const c = validar(esquemaCirurgia, dados);
  const codigos = await conferirReferencias(db, c);
  await db.transaction(async (tx) => {
    const atual = await carregarParaEdicao(tx, id);
    const antes = await tx
      .select({ p: cirurgiaProcedimentos.procedimento })
      .from(cirurgiaProcedimentos)
      .where(eq(cirurgiaProcedimentos.cirurgiaId, id));
    const paciente = c.paciente.replace(/\s+/g, " ");
    await tx
      .update(cirurgias)
      .set({
        paciente,
        data: c.data,
        hora: c.hora ?? null,
        chineloVarianteId: c.chineloVarianteId ?? null,
        observacao: c.observacao || null,
        atualizadoEm: new Date(),
      })
      .where(eq(cirurgias.id, id));
    await tx.delete(cirurgiaProcedimentos).where(eq(cirurgiaProcedimentos.cirurgiaId, id));
    await tx.insert(cirurgiaProcedimentos).values(codigos.map((procedimento) => ({ cirurgiaId: id, procedimento })));
    await registrarAuditoria(tx, {
      acao: "cirurgia_alterada",
      usuarioId: ator.id,
      entidade: "cirurgia",
      entidadeId: String(id),
      detalhes: {
        antes: resumoAuditavel({
          data: atual.data,
          hora: atual.hora?.slice(0, 5),
          procedimentos: antes.map((a) => a.p),
          chineloVarianteId: atual.chineloVarianteId,
        }),
        depois: resumoAuditavel({ ...c, procedimentos: codigos }),
        pacienteAlterado: paciente !== atual.paciente,
      },
    });
  });
}

const esquemaCancelamento = z.object({
  motivo: z.string().trim().min(3, "Informe o motivo do cancelamento.").max(300),
});

export async function cancelarCirurgia(db: Db, ator: Ator, id: number, dados: unknown): Promise<void> {
  autorizar(ator, "cirurgias:editar");
  const { motivo } = validar(esquemaCancelamento, dados);
  await db.transaction(async (tx) => {
    const atual = await carregarParaEdicao(tx, id);
    if (atual.situacao === "cancelada") throw new ErroCatalogo("A cirurgia já está cancelada.");
    await tx.update(cirurgias).set({ situacao: "cancelada", atualizadoEm: new Date() }).where(eq(cirurgias.id, id));
    await registrarAuditoria(tx, {
      acao: "cirurgia_cancelada",
      usuarioId: ator.id,
      entidade: "cirurgia",
      entidadeId: String(id),
      detalhes: { motivo },
    });
  });
}

export async function reativarCirurgia(db: Db, ator: Ator, id: number): Promise<void> {
  autorizar(ator, "cirurgias:editar");
  await db.transaction(async (tx) => {
    const atual = await carregarParaEdicao(tx, id);
    if (atual.situacao !== "cancelada") throw new ErroCatalogo("A cirurgia não está cancelada.");
    await tx.update(cirurgias).set({ situacao: "agendada", atualizadoEm: new Date() }).where(eq(cirurgias.id, id));
    await registrarAuditoria(tx, { acao: "cirurgia_reativada", usuarioId: ator.id, entidade: "cirurgia", entidadeId: String(id) });
  });
}

export type ResumoCirurgia = {
  id: number;
  paciente: string;
  data: string;
  hora: string | null;
  situacao: string;
  observacao: string | null;
  chineloVarianteId: number | null;
  chinelo: string | null;
  procedimentos: { codigo: string; nome: string; tipo: string }[];
};

async function montar(db: Db, linhas: (typeof cirurgias.$inferSelect & { chinelo: string | null })[]): Promise<ResumoCirurgia[]> {
  if (!linhas.length) return [];
  const procs = await db
    .select({
      cirurgiaId: cirurgiaProcedimentos.cirurgiaId,
      codigo: procedimentos.codigo,
      nome: procedimentos.nome,
      tipo: procedimentos.tipo,
    })
    .from(cirurgiaProcedimentos)
    .innerJoin(procedimentos, eq(procedimentos.codigo, cirurgiaProcedimentos.procedimento))
    .where(inArray(cirurgiaProcedimentos.cirurgiaId, linhas.map((l) => l.id)))
    .orderBy(asc(procedimentos.tipo), asc(procedimentos.ordem));
  return linhas.map((l) => ({
    id: l.id,
    paciente: l.paciente,
    data: l.data,
    hora: l.hora ? l.hora.slice(0, 5) : null,
    situacao: l.situacao,
    observacao: l.observacao,
    chineloVarianteId: l.chineloVarianteId,
    chinelo: l.chinelo,
    procedimentos: procs.filter((p) => p.cirurgiaId === l.id).map(({ codigo, nome, tipo }) => ({ codigo, nome, tipo })),
  }));
}

function consultaBase(db: Db) {
  return db
    .select({
      id: cirurgias.id,
      paciente: cirurgias.paciente,
      data: cirurgias.data,
      hora: cirurgias.hora,
      situacao: cirurgias.situacao,
      chineloVarianteId: cirurgias.chineloVarianteId,
      observacao: cirurgias.observacao,
      origem: cirurgias.origem,
      uidEvento: cirurgias.uidEvento,
      criadoPor: cirurgias.criadoPor,
      criadoEm: cirurgias.criadoEm,
      atualizadoEm: cirurgias.atualizadoEm,
      chinelo: variantes.nome,
    })
    .from(cirurgias)
    .leftJoin(variantes, eq(variantes.id, cirurgias.chineloVarianteId));
}

export async function listarCirurgias(db: Db, ator: Ator, periodo: { de: string; ate: string }): Promise<ResumoCirurgia[]> {
  autorizar(ator, "cirurgias:ver");
  if (!dataValida(periodo.de) || !dataValida(periodo.ate)) throw new ErroCatalogo("Período inválido.");
  const linhas = await consultaBase(db)
    .where(and(gte(cirurgias.data, periodo.de), lte(cirurgias.data, periodo.ate)))
    .orderBy(asc(cirurgias.data), asc(cirurgias.hora), asc(cirurgias.id));
  return montar(db, linhas);
}

export async function obterCirurgia(db: Db, ator: Ator, id: number): Promise<ResumoCirurgia | null> {
  autorizar(ator, "cirurgias:ver");
  const linhas = await consultaBase(db).where(eq(cirurgias.id, id));
  return (await montar(db, linhas))[0] ?? null;
}

/** Tamanhos ativos do chinelo, para o formulário. */
export async function tamanhosDeChinelo(db: Db) {
  return db
    .select({ id: variantes.id, nome: variantes.nome })
    .from(variantes)
    .innerJoin(produtos, eq(produtos.id, variantes.produtoId))
    .where(and(ilike(produtos.nome, "%chinelo%"), eq(produtos.ativo, true), eq(variantes.ativo, true)))
    .orderBy(asc(variantes.ordem), asc(variantes.id));
}
