import { describe, expect, it } from "vitest";
import { lerAmbiente, lerEnvServidor } from "@/lib/env";

describe("ambiente", () => {
  it("sem APP_ENV, trata como teste (a faixa amarela não some por esquecimento)", () => {
    expect(lerAmbiente(undefined)).toBe("teste");
    expect(lerAmbiente("")).toBe("teste");
  });

  it("só 'producao' escrito exatamente vira produção", () => {
    expect(lerAmbiente("producao")).toBe("producao");
    expect(lerAmbiente("PRODUCAO")).toBe("teste");
  });
});

describe("configuração do servidor", () => {
  const validas = {
    DATABASE_URL: "postgres://u@h:5432/db",
    APP_ENV: "producao",
    BETTER_AUTH_SECRET: "s".repeat(32),
    BETTER_AUTH_URL: "https://estoque.clinica.com.br/",
  };

  it("aceita uma configuração válida", () => {
    expect(lerEnvServidor(validas)).toEqual({
      databaseUrl: "postgres://u@h:5432/db",
      ambiente: "producao",
      authSecret: "s".repeat(32),
      baseUrl: "https://estoque.clinica.com.br",
    });
  });

  it("recusa chave de sessão curta ou ausente", () => {
    expect(() => lerEnvServidor({ ...validas, BETTER_AUTH_SECRET: "curta" })).toThrow(/32 caracteres/);
    expect(() => lerEnvServidor({ ...validas, BETTER_AUTH_SECRET: undefined })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("recusa a falta de DATABASE_URL com mensagem clara", () => {
    expect(() => lerEnvServidor({})).toThrow(/DATABASE_URL/);
  });

  it("recusa APP_ENV desconhecido em vez de adivinhar", () => {
    expect(() => lerEnvServidor({ ...validas, APP_ENV: "staging" })).toThrow();
  });
});
