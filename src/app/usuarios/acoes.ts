"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  alterarPerfil,
  criarUsuarioPeloAdmin,
  desativarUsuario,
  ErroGestao,
  reativarUsuario,
  redefinirAcesso,
  type Contexto,
} from "@/lib/gestao-usuarios";
import { comAuth, exigirPermissao } from "@/lib/sessao";

export type Resultado = { ok: boolean; mensagem: string; senhaTemporaria?: string; email?: string };

/** Toda ação: confere a permissão no servidor antes de qualquer coisa. */
async function executar(fn: (ctx: Contexto) => Promise<Resultado>): Promise<Resultado> {
  const admin = await exigirPermissao("usuarios:gerir");
  const cabecalhos = new Headers(await headers());
  try {
    const r = await comAuth((auth, db) => fn({ auth, db, headers: cabecalhos, adminId: admin.id }));
    revalidatePath("/usuarios");
    return r;
  } catch (e) {
    if (e instanceof ErroGestao) return { ok: false, mensagem: e.message };
    console.error("Erro na gestão de usuários", e instanceof Error ? e.message : e);
    return { ok: false, mensagem: "Não foi possível concluir. Tente de novo." };
  }
}

export async function acaoCriar(_: Resultado | null, form: FormData): Promise<Resultado> {
  return executar(async (ctx) => {
    const dados = { nome: form.get("nome"), email: form.get("email"), perfil: form.get("perfil") };
    const { senhaTemporaria } = await criarUsuarioPeloAdmin(ctx, dados);
    return { ok: true, mensagem: "Usuário criado.", senhaTemporaria, email: String(dados.email).trim().toLowerCase() };
  });
}

export async function acaoPerfil(alvoId: string, perfil: string): Promise<Resultado> {
  return executar(async (ctx) => {
    await alterarPerfil(ctx, alvoId, perfil);
    return { ok: true, mensagem: "Perfil alterado. A pessoa precisará entrar de novo." };
  });
}

export async function acaoAtivo(alvoId: string, ativar: boolean): Promise<Resultado> {
  return executar(async (ctx) => {
    if (ativar) await reativarUsuario(ctx, alvoId);
    else await desativarUsuario(ctx, alvoId);
    return { ok: true, mensagem: ativar ? "Usuário reativado." : "Usuário desativado." };
  });
}

export async function acaoRedefinir(alvoId: string): Promise<Resultado> {
  return executar(async (ctx) => {
    const { senhaTemporaria } = await redefinirAcesso(ctx, alvoId);
    return { ok: true, mensagem: "Acesso redefinido.", senhaTemporaria };
  });
}
