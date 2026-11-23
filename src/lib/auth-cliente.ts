"use client";
import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Cliente de login usado pelas telas (fala com /api/auth no mesmo endereço). */
export const authCliente = createAuthClient({
  plugins: [twoFactorClient()],
});

/** Traduz os erros da API de login para mensagens da equipe. */
export function mensagemErro(erro: { status?: number; message?: string; code?: string } | null): string {
  if (!erro) return "";
  if (erro.status === 429) return "Muitas tentativas. Aguarde um minuto e tente de novo.";
  if (erro.status === 403) return "Usuário desativado. Fale com o administrador.";
  if (erro.code === "INVALID_EMAIL_OR_PASSWORD") return "E-mail ou senha incorretos.";
  if (erro.code === "INVALID_PASSWORD") return "Senha atual incorreta.";
  if (erro.code === "PASSWORD_TOO_SHORT") return "A senha nova precisa ter pelo menos 10 caracteres.";
  if (erro.code === "INVALID_CODE" || erro.code === "INVALID_BACKUP_CODE")
    return "Código incorreto. Confira no aplicativo e tente de novo.";
  if (erro.code === "INVALID_TWO_FACTOR_COOKIE") return "O tempo para digitar o código acabou. Entre de novo.";
  if (erro.status === 401) return "Não foi possível confirmar. Confira os dados e tente de novo.";
  return "Algo deu errado. Tente de novo em instantes.";
}
