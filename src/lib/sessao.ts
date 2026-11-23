import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { registrarAuditoria } from "@/db/auditoria";
import { comBanco, type Db } from "@/db/client";
import { criarAuth, type Auth } from "./auth";
import { lerEnvServidor } from "./env";
import { ehPerfil, pode, type Acao, type Perfil } from "./permissoes";

export type UsuarioAtual = {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil | null;
  verificacaoAtiva: boolean;
  deveTrocarSenha: boolean;
};

/** Abre banco + autenticação para uma requisição e fecha ao final. */
export async function comAuth<T>(fn: (auth: Auth, db: Db) => Promise<T>): Promise<T> {
  const env = lerEnvServidor();
  return comBanco(env.databaseUrl, (db) =>
    fn(criarAuth(db, { secret: env.authSecret, baseURL: env.baseUrl, producao: env.ambiente === "producao" }), db),
  );
}

export async function obterUsuarioAtual(): Promise<UsuarioAtual | null> {
  const cabecalhos = await headers();
  const sessao = await comAuth((auth) => auth.api.getSession({ headers: cabecalhos }));
  if (!sessao) return null;
  const u = sessao.user;
  return {
    id: u.id,
    nome: u.name,
    email: u.email,
    perfil: ehPerfil(u.role) ? u.role : null,
    verificacaoAtiva: u.twoFactorEnabled === true,
    deveTrocarSenha: u.deveTrocarSenha !== false,
  };
}

/** Exige login completo: senha trocada e código de verificação configurado. */
export async function exigirLogin(): Promise<UsuarioAtual & { perfil: Perfil }> {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/entrar");
  if (usuario.deveTrocarSenha || !usuario.verificacaoAtiva) redirect("/primeiro-acesso");
  if (!usuario.perfil) redirect("/entrar?erro=perfil");
  return usuario as UsuarioAtual & { perfil: Perfil };
}

/**
 * Exige uma permissão. Usar no início de TODA página e TODA ação do servidor.
 * Tentativas negadas ficam na auditoria.
 */
export async function exigirPermissao(acao: Acao): Promise<UsuarioAtual & { perfil: Perfil }> {
  const usuario = await exigirLogin();
  if (!pode(usuario.perfil, acao)) {
    await comAuth((_, db) =>
      registrarAuditoria(db, { acao: "acesso_negado", usuarioId: usuario.id, detalhes: { permissao: acao } }),
    );
    redirect("/?negado=1");
  }
  return usuario;
}
