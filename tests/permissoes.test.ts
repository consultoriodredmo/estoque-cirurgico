import { describe, expect, it } from "vitest";
import { ACOES, pode, type Acao } from "@/lib/permissoes";

/**
 * Tabela "Permissões por perfil" (seção 5 do plano), linha por linha.
 * [ação, hospital (Eliadna), compras (Mariana), administrador]
 */
const TABELA: [Acao, boolean, boolean, boolean][] = [
  ["cirurgias:ver", true, true, true],
  ["cirurgias:editar", false, true, true],
  ["consumo:confirmar", true, false, true],
  ["contagem:registrar", true, false, true],
  ["transferencia:receber", true, false, true],
  ["produtos:ver", true, true, true],
  ["produtos:editar", false, true, true],
  ["fornecedores:editar", false, true, true],
  ["compras:gerir", false, true, true],
  ["transferencia:aprovar", false, true, true],
  ["ajuste:solicitar", true, true, true],
  ["ajuste:fazer", false, true, true],
  ["custos:editar", false, true, true],
  ["valores:ver", false, true, true],
  ["estoque:ver", true, true, true],
  ["relatorios:ver", false, true, true],
  ["regras:editar", false, false, true],
  ["usuarios:gerir", false, false, true],
  ["configuracoes:gerir", false, false, true],
  ["auditoria:ver", false, false, true],
];

describe("matriz de permissões", () => {
  it("cobre todas as ações do sistema", () => {
    expect(TABELA.map(([a]) => a).sort()).toEqual([...ACOES].sort());
  });

  it.each(TABELA)("%s → hospital=%s, compras=%s, administrador=%s", (acao, hospital, compras, administrador) => {
    expect(pode("hospital", acao)).toBe(hospital);
    expect(pode("compras", acao)).toBe(compras);
    expect(pode("administrador", acao)).toBe(administrador);
  });

  it("teste de aceitação 10: Eliadna não aprova compra, não edita custo, não ajusta inventário", () => {
    expect(pode("hospital", "compras:gerir")).toBe(false);
    expect(pode("hospital", "custos:editar")).toBe(false);
    expect(pode("hospital", "ajuste:fazer")).toBe(false);
    expect(pode("hospital", "valores:ver")).toBe(false);
  });

  it("perfil ausente ou desconhecido não pode nada", () => {
    for (const acao of ACOES) {
      expect(pode(undefined, acao)).toBe(false);
      expect(pode("superusuario", acao)).toBe(false);
      expect(pode("", acao)).toBe(false);
    }
  });
});
