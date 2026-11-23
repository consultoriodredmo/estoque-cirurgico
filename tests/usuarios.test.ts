import { desc, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { auditoria, user } from "@/db/schema";
import {
  alterarPerfil,
  criarUsuarioPeloAdmin,
  desativarUsuario,
  ErroGestao,
  listarUsuarios,
  reativarUsuario,
  redefinirAcesso,
  type Contexto,
} from "@/lib/gestao-usuarios";
import { gerarSenhaTemporaria } from "@/lib/usuarios";
import { entrar, Navegador, prepararAuth, usuarioPronto } from "./apoio/navegador";
import { codigoTotp } from "./apoio/totp";

const { auth, db, fechar } = prepararAuth();
afterAll(fechar);

async function contextoAdmin(sufixo: string): Promise<Contexto> {
  const u = await usuarioPronto(auth, "administrador", sufixo);
  const nav = await entrar(auth, u);
  return { auth, db, headers: nav.cabecalhos(), adminId: u.id };
}

describe("gestão de usuários pelo administrador", () => {
  it("cria usuário com senha temporária e primeiro acesso pendente", async () => {
    const ctx = await contextoAdmin("g-cria");
    const { senhaTemporaria } = await criarUsuarioPeloAdmin(ctx, {
      nome: "Eliadna Teste",
      email: "  Eliadna.Teste@Clinica.test ",
      perfil: "hospital",
    });
    expect(senhaTemporaria).toHaveLength(14);

    const [criada] = await db.select().from(user).where(eq(user.email, "eliadna.teste@clinica.test"));
    expect(criada.role).toBe("hospital");
    expect(criada.deveTrocarSenha).toBe(true);

    const nav = new Navegador(auth);
    const r = await nav.post("/sign-in/email", { email: "eliadna.teste@clinica.test", password: senhaTemporaria });
    expect(r.status).toBe(200);
    expect((await nav.sessao())?.user.deveTrocarSenha).toBe(true);

    const [evento] = await db.select().from(auditoria).where(eq(auditoria.acao, "usuario_criado")).orderBy(desc(auditoria.id)).limit(1);
    expect(evento.usuarioId).toBe(ctx.adminId);
  });

  it("recusa dados inválidos e e-mail repetido com mensagem clara", async () => {
    const ctx = await contextoAdmin("g-invalido");
    await expect(criarUsuarioPeloAdmin(ctx, { nome: "Ab", email: "x@y.test", perfil: "hospital" })).rejects.toThrow(ErroGestao);
    await expect(criarUsuarioPeloAdmin(ctx, { nome: "Fulana", email: "nao-e-email", perfil: "hospital" })).rejects.toThrow(
      "E-mail inválido.",
    );
    await expect(criarUsuarioPeloAdmin(ctx, { nome: "Fulana", email: "f@y.test", perfil: "dono" })).rejects.toThrow(ErroGestao);
    await criarUsuarioPeloAdmin(ctx, { nome: "Repetida", email: "repetida@clinica.test", perfil: "compras" });
    await expect(
      criarUsuarioPeloAdmin(ctx, { nome: "Repetida 2", email: "REPETIDA@clinica.test", perfil: "compras" }),
    ).rejects.toThrow("Já existe um usuário com esse e-mail.");
  });

  it("o administrador não pode mudar o próprio perfil nem se desativar", async () => {
    const ctx = await contextoAdmin("g-proprio");
    await expect(alterarPerfil(ctx, ctx.adminId, "hospital")).rejects.toThrow(/próprio usuário/);
    await expect(desativarUsuario(ctx, ctx.adminId)).rejects.toThrow(/próprio usuário/);
    await expect(redefinirAcesso(ctx, ctx.adminId)).rejects.toThrow(/próprio usuário/);
  });

  it("mudar o perfil vale na hora: a sessão antiga é encerrada", async () => {
    const ctx = await contextoAdmin("g-perfil");
    const alvo = await usuarioPronto(auth, "compras", "g-perfil-alvo");
    const nav = await entrar(auth, alvo);
    expect(await nav.sessao()).not.toBeNull();

    await alterarPerfil(ctx, alvo.id, "hospital");
    expect(await nav.sessao()).toBeNull();
    const [depois] = await db.select().from(user).where(eq(user.id, alvo.id));
    expect(depois.role).toBe("hospital");
  });

  it("desativar e reativar", async () => {
    const ctx = await contextoAdmin("g-ativo");
    const alvo = await usuarioPronto(auth, "hospital", "g-ativo-alvo");
    await desativarUsuario(ctx, alvo.id);
    expect((await listarUsuarios(db)).find((u) => u.id === alvo.id)?.ativo).toBe(false);
    await reativarUsuario(ctx, alvo.id);
    const nav = await entrar(auth, alvo);
    expect(await nav.sessao()).not.toBeNull();
  });

  it("redefinir acesso (celular perdido): senha e código antigos deixam de valer", async () => {
    const ctx = await contextoAdmin("g-redefinir");
    const alvo = await usuarioPronto(auth, "hospital", "g-redefinir-alvo");
    const sessaoAntiga = await entrar(auth, alvo);

    const { senhaTemporaria } = await redefinirAcesso(ctx, alvo.id);
    expect(await sessaoAntiga.sessao()).toBeNull();

    const comSenhaAntiga = await new Navegador(auth).post("/sign-in/email", { email: alvo.email, password: alvo.senha });
    expect(comSenhaAntiga.status).toBe(401);

    // Com a temporária, entra direto no primeiro acesso (sem pedir o código antigo).
    const nav = new Navegador(auth);
    const r = await nav.post("/sign-in/email", { email: alvo.email, password: senhaTemporaria });
    expect(r.json.twoFactorRedirect).toBeUndefined();
    const s = await nav.sessao();
    expect(s?.user.deveTrocarSenha).toBe(true);
    expect(s?.user.twoFactorEnabled).toBe(false);

    // E o código do celular antigo não serve mais para nada.
    const antigo = await nav.post("/two-factor/verify-totp", { code: codigoTotp(alvo.totpURI) });
    expect(antigo.status).toBeGreaterThanOrEqual(400);
  });

  it("usuário inexistente gera mensagem, não erro técnico", async () => {
    const ctx = await contextoAdmin("g-inexistente");
    await expect(desativarUsuario(ctx, "nao-existe")).rejects.toThrow("Usuário não encontrado.");
  });
});

describe("senha temporária", () => {
  it("tem 14 caracteres sem símbolos ambíguos e não se repete", () => {
    const senhas = new Set(Array.from({ length: 200 }, () => gerarSenhaTemporaria()));
    expect(senhas.size).toBe(200);
    for (const s of senhas) expect(s).toMatch(/^[A-HJ-NP-Za-km-np-z2-9]{14}$/);
  });
});
