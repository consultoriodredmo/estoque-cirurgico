import { and, desc, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { auditoria, session, user } from "@/db/schema";
import { SESSAO_SEGUNDOS } from "@/lib/auth";
import { criarUsuarioDireto } from "@/lib/usuarios";
import { entrar, Navegador, prepararAuth, usuarioPronto } from "./apoio/navegador";
import { codigoTotp } from "./apoio/totp";

const { auth, db, fechar } = prepararAuth();
afterAll(fechar);

async function ultimosEventos(usuarioId: string) {
  const linhas = await db
    .select({ acao: auditoria.acao })
    .from(auditoria)
    .where(eq(auditoria.usuarioId, usuarioId))
    .orderBy(desc(auditoria.id));
  return linhas.map((l) => l.acao);
}

describe("cadastro e senha", () => {
  it("ninguém consegue criar conta sozinho", async () => {
    const r = await new Navegador(auth).post("/sign-up/email", {
      name: "Intruso",
      email: "intruso@fora.test",
      password: "Qualquer-Senha-1",
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
    const [existe] = await db.select().from(user).where(eq(user.email, "intruso@fora.test"));
    expect(existe).toBeUndefined();
  });

  it("senha errada é recusada e fica na auditoria (com o e-mail, sem a senha)", async () => {
    await criarUsuarioDireto(auth, {
      nome: "Errado",
      email: "senha.errada@clinica.test",
      perfil: "hospital",
      senha: "Temporaria-123",
    });
    const r = await new Navegador(auth).post("/sign-in/email", {
      email: "senha.errada@clinica.test",
      password: "nao-e-esta",
    });
    expect(r.status).toBe(401);
    const [evento] = await db
      .select()
      .from(auditoria)
      .where(eq(auditoria.acao, "login_falhou"))
      .orderBy(desc(auditoria.id))
      .limit(1);
    expect(evento.detalhes).toEqual({ email: "senha.errada@clinica.test" });
    expect(JSON.stringify(evento)).not.toContain("nao-e-esta");
  });

  it("senha nova curta demais é recusada", async () => {
    await criarUsuarioDireto(auth, {
      nome: "Curta",
      email: "curta@clinica.test",
      perfil: "hospital",
      senha: "Temporaria-123",
    });
    const nav = new Navegador(auth);
    await nav.post("/sign-in/email", { email: "curta@clinica.test", password: "Temporaria-123" });
    const r = await nav.post("/change-password", { currentPassword: "Temporaria-123", newPassword: "curta1" });
    expect(r.status).toBe(400);
  });
});

describe("primeiro acesso", () => {
  it("usuário novo entra só para trocar a senha e configurar o código", async () => {
    const id = await criarUsuarioDireto(auth, {
      nome: "Novata",
      email: "novata@clinica.test",
      perfil: "compras",
      senha: "Temporaria-123",
    });
    const nav = new Navegador(auth);
    const login = await nav.post("/sign-in/email", { email: "novata@clinica.test", password: "Temporaria-123" });
    expect(login.status).toBe(200);

    let s = await nav.sessao();
    expect(s?.user.deveTrocarSenha).toBe(true);
    expect(s?.user.twoFactorEnabled).toBe(false);

    const troca = await nav.post("/change-password", {
      currentPassword: "Temporaria-123",
      newPassword: "Senha-Definitiva-456",
    });
    expect(troca.status).toBe(200);
    s = await nav.sessao();
    expect(s?.user.deveTrocarSenha).toBe(false);

    const ativar = await nav.post("/two-factor/enable", { password: "Senha-Definitiva-456" });
    expect(String(ativar.json.totpURI)).toMatch(/^otpauth:\/\/totp\//);
    expect(ativar.json.backupCodes).toHaveLength(8);

    // Antes de confirmar o código, a verificação ainda não está ativa.
    s = await nav.sessao();
    expect(s?.user.twoFactorEnabled).toBe(false);

    const confirmar = await nav.post("/two-factor/verify-totp", { code: codigoTotp(String(ativar.json.totpURI)) });
    expect(confirmar.status).toBe(200);
    s = await nav.sessao();
    expect(s?.user.twoFactorEnabled).toBe(true);

    expect(await ultimosEventos(id)).toEqual(
      expect.arrayContaining(["login", "senha_trocada", "verificacao_iniciada", "verificacao_ativada"]),
    );
  });
});

describe("login com código de verificação", () => {
  it("senha certa sozinha não abre sessão: exige o código", async () => {
    const u = await usuarioPronto(auth, "hospital", "codigo");
    const nav = new Navegador(auth);
    const r = await nav.post("/sign-in/email", { email: u.email, password: u.senha });
    expect(r.json.twoFactorRedirect).toBe(true);
    expect(await nav.sessao()).toBeNull();

    const errado = await nav.post("/two-factor/verify-totp", { code: "000000" });
    expect(errado.status).toBeGreaterThanOrEqual(400);
    expect(await nav.sessao()).toBeNull();

    const certo = await entrar(auth, u);
    const s = await certo.sessao();
    expect(s?.user.id).toBe(u.id);
    expect(await ultimosEventos(u.id)).toContain("codigo_invalido");
  });

  it("a sessão expira em 12 horas", async () => {
    const u = await usuarioPronto(auth, "compras", "expira");
    const nav = await entrar(auth, u);
    const s = await nav.sessao();
    const [linha] = await db.select().from(session).where(eq(session.id, s!.session.id));
    const segundos = (linha.expiresAt.getTime() - Date.now()) / 1000;
    expect(segundos).toBeGreaterThan(SESSAO_SEGUNDOS - 60);
    expect(segundos).toBeLessThanOrEqual(SESSAO_SEGUNDOS + 5);
  });

  it("sair encerra a sessão e fica registrado", async () => {
    const u = await usuarioPronto(auth, "hospital", "sair");
    const nav = await entrar(auth, u);
    expect(await nav.sessao()).not.toBeNull();
    await nav.post("/sign-out");
    expect(await nav.sessao()).toBeNull();
    expect((await ultimosEventos(u.id))[0]).toBe("logout");
  });

  it("muitas tentativas de senha seguidas são bloqueadas temporariamente", async () => {
    const nav = new Navegador(auth);
    const status: number[] = [];
    for (let i = 0; i < 7; i++) {
      status.push((await nav.post("/sign-in/email", { email: "ninguem@clinica.test", password: "x".repeat(12) })).status);
    }
    expect(status.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(status.at(-1)).toBe(429);
  });
});

describe("administração de usuários", () => {
  it("só o administrador cria usuários e muda perfis", async () => {
    const hospital = await entrar(auth, await usuarioPronto(auth, "hospital", "tenta-admin"));
    const compras = await entrar(auth, await usuarioPronto(auth, "compras", "tenta-admin"));
    for (const nav of [hospital, compras]) {
      const r = await nav.post("/admin/create-user", {
        email: "criado.indevido@clinica.test",
        password: "Senha-Qualquer-1",
        name: "Indevido",
        role: "administrador",
      });
      expect(r.status).toBe(403);
    }

    const admin = await entrar(auth, await usuarioPronto(auth, "administrador", "cria"));
    const r = await admin.post("/admin/create-user", {
      email: "criado.certo@clinica.test",
      password: "Senha-Qualquer-1",
      name: "Criado",
      role: "hospital",
    });
    expect(r.status).toBe(200);
  });

  it("usuário desativado não entra mais e perde a sessão na hora", async () => {
    const admin = await entrar(auth, await usuarioPronto(auth, "administrador", "desativa"));
    const u = await usuarioPronto(auth, "hospital", "desativada");
    const nav = await entrar(auth, u);
    expect(await nav.sessao()).not.toBeNull();

    const r = await admin.post("/admin/ban-user", { userId: u.id });
    expect(r.status).toBe(200);
    expect(await nav.sessao()).toBeNull();

    const login = await new Navegador(auth).post("/sign-in/email", { email: u.email, password: u.senha });
    expect(login.status).toBe(403);
  });

  it("o administrador não pode se passar por outro usuário", async () => {
    const admin = await entrar(auth, await usuarioPronto(auth, "administrador", "imperson"));
    const alvo = await usuarioPronto(auth, "compras", "alvo");
    const r = await admin.post("/admin/impersonate-user", { userId: alvo.id });
    expect(r.status).toBe(403);
  });

  it("perfil inválido é recusado pelo banco", async () => {
    await expect(
      db.execute(sql`update "user" set role = 'superusuario' where email = 'novata@clinica.test'`),
    ).rejects.toThrow();
  });
});

describe("trilha de auditoria", () => {
  it("não pode ser alterada nem apagada", async () => {
    const [qualquer] = await db.select().from(auditoria).limit(1);
    await expect(
      db.update(auditoria).set({ acao: "apagado" }).where(eq(auditoria.id, qualquer.id)),
    ).rejects.toThrow();
    await expect(db.delete(auditoria).where(and(eq(auditoria.id, qualquer.id)))).rejects.toThrow();
  });
});
