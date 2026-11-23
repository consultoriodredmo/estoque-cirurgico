import "server-only";
import { ErroCatalogo, type Ator } from "./catalogo";
import type { Db } from "@/db/client";
import type { Acao } from "./permissoes";
import { comAuth, exigirPermissao } from "./sessao";

export type Resultado = { ok: boolean; mensagem: string; id?: number };

/**
 * Executa uma ação do servidor: confere a permissão, abre o banco e traduz
 * erros conhecidos em mensagem para a tela. Erros inesperados não vazam detalhes.
 */
export async function executarAcao(
  permissao: Acao,
  fn: (db: Db, ator: Ator) => Promise<Resultado>,
): Promise<Resultado> {
  const usuario = await exigirPermissao(permissao);
  try {
    return await comAuth((_, db) => fn(db, { id: usuario.id, perfil: usuario.perfil }));
  } catch (e) {
    if (e instanceof ErroCatalogo) return { ok: false, mensagem: e.message };
    console.error("Erro em ação", e instanceof Error ? e.message : e);
    return { ok: false, mensagem: "Não foi possível concluir. Tente de novo." };
  }
}

/** Lê um campo de formulário como texto (vazio → null). */
export function campo(form: FormData, nome: string): string | null {
  const v = form.get(nome);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Lê um campo numérico inteiro (vazio → null; inválido → NaN, recusado na validação). */
export function campoInteiro(form: FormData, nome: string): number | null {
  const v = campo(form, nome);
  return v == null ? null : Number(v);
}
