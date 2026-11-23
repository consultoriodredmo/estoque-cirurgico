import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "@/db/auditoria";
import type { Db } from "@/db/client";
import { twoFactor, user } from "@/db/schema";
import type { Auth } from "./auth";
import { PERFIS, type Perfil } from "./permissoes";
import { gerarSenhaTemporaria, normalizarEmail } from "./usuarios";

/** Erro com mensagem pronta para mostrar na tela. */
export class ErroGestao extends Error {}

export type Contexto = { auth: Auth; db: Db; headers: Headers; adminId: string };

export type LinhaUsuario = {
  id: string;
  nome: string;
  email: string;
  perfil: string | null;
  ativo: boolean;
  verificacaoAtiva: boolean;
  primeiroAcessoPendente: boolean;
};

export async function listarUsuarios(db: Db): Promise<LinhaUsuario[]> {
  const linhas = await db.select().from(user).orderBy(asc(user.name));
  return linhas.map((u) => ({
    id: u.id,
    nome: u.name,
    email: u.email,
    perfil: u.role,
    ativo: !u.banned,
    verificacaoAtiva: u.twoFactorEnabled === true,
    primeiroAcessoPendente: u.deveTrocarSenha || !u.twoFactorEnabled,
  }));
}

const esquemaNovo = z.object({
  nome: z.string().trim().min(3, "Informe o nome completo.").max(120),
  email: z.string().transform(normalizarEmail).pipe(z.email("E-mail inválido.")),
  perfil: z.enum(PERFIS, { error: "Escolha um perfil." }),
});

function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const r = esquema.safeParse(dados);
  if (!r.success) throw new ErroGestao(r.error.issues[0]?.message ?? "Dados inválidos.");
  return r.data;
}

function naoEmSiMesmo(ctx: Contexto, alvoId: string) {
  if (alvoId === ctx.adminId) {
    throw new ErroGestao("Você não pode fazer isso com o seu próprio usuário. Peça a outro administrador.");
  }
}

async function alvoExiste(ctx: Contexto, alvoId: string) {
  const [alvo] = await ctx.db.select({ id: user.id }).from(user).where(eq(user.id, alvoId));
  if (!alvo) throw new ErroGestao("Usuário não encontrado.");
}

export async function criarUsuarioPeloAdmin(ctx: Contexto, dados: unknown): Promise<{ senhaTemporaria: string }> {
  const novo = validar(esquemaNovo, dados);
  const [existente] = await ctx.db.select({ id: user.id }).from(user).where(eq(user.email, novo.email));
  if (existente) throw new ErroGestao("Já existe um usuário com esse e-mail.");

  const senhaTemporaria = gerarSenhaTemporaria();
  const criado = await ctx.auth.api.createUser({
    body: { email: novo.email, password: senhaTemporaria, name: novo.nome, role: novo.perfil },
    headers: ctx.headers,
  });
  await registrarAuditoria(ctx.db, {
    acao: "usuario_criado",
    usuarioId: ctx.adminId,
    entidade: "usuario",
    entidadeId: criado.user.id,
    detalhes: { perfil: novo.perfil },
  });
  return { senhaTemporaria };
}

export async function alterarPerfil(ctx: Contexto, alvoId: string, perfil: unknown): Promise<void> {
  naoEmSiMesmo(ctx, alvoId);
  await alvoExiste(ctx, alvoId);
  const novo: Perfil = validar(z.enum(PERFIS), perfil);
  const [antes] = await ctx.db.select({ perfil: user.role }).from(user).where(eq(user.id, alvoId));
  await ctx.auth.api.setRole({ body: { userId: alvoId, role: novo }, headers: ctx.headers });
  // Perfil novo vale já: sessões antigas são encerradas.
  await ctx.auth.api.revokeUserSessions({ body: { userId: alvoId }, headers: ctx.headers });
  await registrarAuditoria(ctx.db, {
    acao: "perfil_alterado",
    usuarioId: ctx.adminId,
    entidade: "usuario",
    entidadeId: alvoId,
    detalhes: { de: antes?.perfil ?? null, para: novo },
  });
}

export async function desativarUsuario(ctx: Contexto, alvoId: string): Promise<void> {
  naoEmSiMesmo(ctx, alvoId);
  await alvoExiste(ctx, alvoId);
  await ctx.auth.api.banUser({ body: { userId: alvoId, banReason: "Desativado pelo administrador" }, headers: ctx.headers });
  await registrarAuditoria(ctx.db, { acao: "usuario_desativado", usuarioId: ctx.adminId, entidade: "usuario", entidadeId: alvoId });
}

export async function reativarUsuario(ctx: Contexto, alvoId: string): Promise<void> {
  naoEmSiMesmo(ctx, alvoId);
  await alvoExiste(ctx, alvoId);
  await ctx.auth.api.unbanUser({ body: { userId: alvoId }, headers: ctx.headers });
  await registrarAuditoria(ctx.db, { acao: "usuario_reativado", usuarioId: ctx.adminId, entidade: "usuario", entidadeId: alvoId });
}

/**
 * Para senha esquecida ou celular perdido: gera senha temporária nova, apaga o
 * código de verificação e encerra as sessões. A pessoa refaz o primeiro acesso.
 */
export async function redefinirAcesso(ctx: Contexto, alvoId: string): Promise<{ senhaTemporaria: string }> {
  naoEmSiMesmo(ctx, alvoId);
  await alvoExiste(ctx, alvoId);
  const senhaTemporaria = gerarSenhaTemporaria();
  await ctx.auth.api.setUserPassword({ body: { userId: alvoId, newPassword: senhaTemporaria }, headers: ctx.headers });
  await ctx.db.transaction(async (tx) => {
    await tx.delete(twoFactor).where(eq(twoFactor.userId, alvoId));
    await tx.update(user).set({ twoFactorEnabled: false, deveTrocarSenha: true }).where(eq(user.id, alvoId));
  });
  await ctx.auth.api.revokeUserSessions({ body: { userId: alvoId }, headers: ctx.headers });
  await registrarAuditoria(ctx.db, { acao: "acesso_redefinido", usuarioId: ctx.adminId, entidade: "usuario", entidadeId: alvoId });
  return { senhaTemporaria };
}
