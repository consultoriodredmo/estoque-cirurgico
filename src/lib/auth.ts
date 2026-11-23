import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { admin, twoFactor } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";
import { eq } from "drizzle-orm";
import { registrarAuditoria } from "@/db/auditoria";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";

export type ConfigAuth = {
  secret: string;
  baseURL: string;
  /** Em produção: cookies "__Secure-" e limite de tentativas sempre ligado. */
  producao: boolean;
};

export const SESSAO_SEGUNDOS = 12 * 60 * 60; // expira após 12 h sem uso
export const SENHA_MINIMA = 10;

const ac = createAccessControl(defaultStatements);
// Administrador pode gerir usuários, mas NÃO pode "se passar" por outro usuário.
const administrador = ac.newRole({
  ...adminAc.statements,
  user: adminAc.statements.user.filter((p) => p !== "impersonate"),
});
const semPoderes = ac.newRole({ user: [], session: [] });

export function criarAuth(db: Db, config: ConfigAuth) {
  return betterAuth({
    appName: "Estoque Cirúrgico",
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: [config.baseURL],
    database: drizzleAdapter(db, { provider: "pg", schema }),

    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // só o administrador cria contas
      minPasswordLength: SENHA_MINIMA,
      maxPasswordLength: 128,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
    },

    user: {
      additionalFields: {
        deveTrocarSenha: { type: "boolean", required: false, defaultValue: true, input: false },
      },
    },

    session: {
      expiresIn: SESSAO_SEGUNDOS,
      updateAge: 60 * 60, // renova a cada 1 h de uso
      // Sem cache em cookie: desativar um usuário corta o acesso na hora.
      cookieCache: { enabled: false },
    },

    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/two-factor/verify-totp": { window: 60, max: 5 },
        "/two-factor/verify-backup-code": { window: 60, max: 5 },
        "/change-password": { window: 60, max: 5 },
      },
    },

    advanced: {
      cookiePrefix: "estoque",
      useSecureCookies: config.producao,
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"] },
      defaultCookieAttributes: { sameSite: "strict", httpOnly: true },
    },

    plugins: [
      twoFactor({
        issuer: "Estoque Cirúrgico",
        backupCodeOptions: { amount: 8, length: 10 },
        accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 15 * 60 },
      }),
      admin({
        defaultRole: "hospital",
        adminRoles: ["administrador"],
        ac,
        roles: { administrador, compras: semPoderes, hospital: semPoderes },
        bannedUserMessage: "Usuário desativado. Fale com o administrador.",
      }),
    ],

    databaseHooks: {
      session: {
        create: {
          // Sessão só é criada depois de senha + código: é o login completo.
          after: async (sessao) => {
            await registrarAuditoria(db, {
              acao: "login",
              usuarioId: sessao.userId,
              ip: sessao.ipAddress ?? null,
            });
          },
        },
      },
    },

    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        const retorno = ctx.context.returned;
        const falhou = retorno instanceof APIError;
        const usuarioId = ctx.context.session?.user.id ?? ctx.context.newSession?.user.id ?? null;
        const ip =
          ctx.request?.headers.get("cf-connecting-ip") ??
          ctx.request?.headers.get("x-forwarded-for") ??
          null;

        switch (ctx.path) {
          case "/sign-in/email":
            if (falhou) {
              await registrarAuditoria(db, {
                acao: "login_falhou",
                detalhes: { email: String(ctx.body?.email ?? "").toLowerCase() },
                ip,
              });
            }
            break;
          case "/two-factor/verify-totp":
          case "/two-factor/verify-backup-code":
            if (falhou) {
              await registrarAuditoria(db, {
                acao: "codigo_invalido",
                usuarioId: usuarioId ?? (await usuarioDoDesafio(ctx)),
                ip,
              });
            } else if (ctx.context.session) {
              // Com sessão já aberta, o código confirma a ativação do autenticador.
              await registrarAuditoria(db, { acao: "verificacao_ativada", usuarioId, ip });
            }
            break;
          case "/change-password":
            if (!falhou && usuarioId) {
              await db
                .update(schema.user)
                .set({ deveTrocarSenha: false })
                .where(eq(schema.user.id, usuarioId));
              await registrarAuditoria(db, { acao: "senha_trocada", usuarioId, ip });
            }
            break;
          case "/two-factor/enable":
            if (!falhou && usuarioId) {
              await registrarAuditoria(db, { acao: "verificacao_iniciada", usuarioId, ip });
            }
            break;
        }
      }),
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-out") {
          const sessao = await getSessionFromCtx(ctx).catch(() => null);
          if (sessao) await registrarAuditoria(db, { acao: "logout", usuarioId: sessao.user.id });
        }
      }),
    },
  });
}

export type Auth = ReturnType<typeof criarAuth>;

type CtxMiddleware = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/**
 * Durante o desafio do código (entre a senha e o código), ainda não há sessão.
 * O usuário é identificado pelo cookie assinado do desafio, como faz a biblioteca.
 */
async function usuarioDoDesafio(ctx: CtxMiddleware): Promise<string | null> {
  try {
    const cookie = ctx.context.createAuthCookie("two_factor");
    const valor = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
    if (!valor) return null;
    const registro = await ctx.context.internalAdapter.findVerificationValue(valor);
    return registro?.value ?? null;
  } catch {
    return null;
  }
}
