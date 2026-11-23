import type { Auth } from "./auth";
import type { Perfil } from "./permissoes";

// Sem letras e números que se confundem (0/O, 1/l/I).
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Senha temporária aleatória, para o primeiro acesso ou após redefinição. */
export function gerarSenhaTemporaria(tamanho = 14): string {
  const limite = 256 - (256 % ALFABETO.length); // evita viés na distribuição
  let senha = "";
  while (senha.length < tamanho) {
    const bytes = crypto.getRandomValues(new Uint8Array(tamanho * 2));
    for (const b of bytes) {
      if (b < limite && senha.length < tamanho) senha += ALFABETO[b % ALFABETO.length];
    }
  }
  return senha;
}

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type NovoUsuario = { nome: string; email: string; perfil: Perfil; senha: string };

/**
 * Cria um usuário diretamente, sem sessão de administrador. Usado SÓ pelo
 * script do primeiro administrador e pelos testes. Na tela, a criação passa
 * pela API de administração, que confere a permissão de quem está criando.
 */
export async function criarUsuarioDireto(auth: Auth, dados: NovoUsuario): Promise<string> {
  const ctx = await auth.$context;
  const email = normalizarEmail(dados.email);
  if (await ctx.internalAdapter.findUserByEmail(email)) {
    throw new Error(`Já existe um usuário com o e-mail ${email}.`);
  }
  const usuario = await ctx.internalAdapter.createUser({
    name: dados.nome.trim(),
    email,
    emailVerified: true,
    role: dados.perfil,
    deveTrocarSenha: true,
  }, { method: "admin" });
  await ctx.internalAdapter.linkAccount({
    userId: usuario.id,
    providerId: "credential",
    accountId: usuario.id,
    password: await ctx.password.hash(dados.senha),
  });
  return usuario.id;
}
