import { z } from "zod";

/**
 * Ambiente em que o sistema está rodando.
 * - "teste": dados fictícios, faixa "AMBIENTE DE TESTE" visível em todas as telas.
 * - "producao": dados reais.
 *
 * Por segurança, valor ausente é tratado como "teste" (a faixa de teste nunca
 * some por esquecimento) e valor desconhecido é recusado na leitura do servidor.
 */
export const AMBIENTES = ["teste", "producao"] as const;
export type Ambiente = (typeof AMBIENTES)[number];

export function lerAmbiente(valor: string | undefined): Ambiente {
  return valor === "producao" ? "producao" : "teste";
}

const esquemaServidor = z.object({
  DATABASE_URL: z
    .string({ error: "DATABASE_URL não configurada" })
    .regex(/^postgres(ql)?:\/\//, "DATABASE_URL deve começar com postgres://"),
  APP_ENV: z.enum(AMBIENTES).optional(),
  BETTER_AUTH_SECRET: z
    .string({ error: "BETTER_AUTH_SECRET não configurado" })
    .min(32, "BETTER_AUTH_SECRET precisa de pelo menos 32 caracteres"),
  BETTER_AUTH_URL: z.url({ error: "BETTER_AUTH_URL deve ser o endereço do sistema (https://...)" }),
});

export type EnvServidor = {
  databaseUrl: string;
  ambiente: Ambiente;
  authSecret: string;
  baseUrl: string;
};

/** Lê e valida as variáveis do servidor. Falha cedo, com mensagem clara. */
export function lerEnvServidor(fonte: Record<string, string | undefined> = process.env): EnvServidor {
  const resultado = esquemaServidor.safeParse(fonte);
  if (!resultado.success) {
    const mensagens = resultado.error.issues.map((i) => `- ${i.message}`).join("\n");
    throw new Error(`Configuração inválida:\n${mensagens}`);
  }
  return {
    databaseUrl: resultado.data.DATABASE_URL,
    ambiente: lerAmbiente(resultado.data.APP_ENV),
    authSecret: resultado.data.BETTER_AUTH_SECRET,
    baseUrl: resultado.data.BETTER_AUTH_URL.replace(/\/$/, ""),
  };
}
