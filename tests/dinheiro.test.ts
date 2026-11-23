import { describe, expect, it } from "vitest";
import { centavosParaCampo, formatarReais, paraCentavos } from "@/lib/dinheiro";

describe("valores em reais", () => {
  it.each([
    ["125,90", 12590],
    ["1.234,56", 123456],
    ["R$ 12", 1200],
    ["12.5", 1250],
    ["0,05", 5],
  ])("%s → %i centavos", (texto, centavos) => {
    expect(paraCentavos(texto)).toBe(centavos);
  });

  it("vazio é nulo; texto inválido é recusado", () => {
    expect(paraCentavos("")).toBeNull();
    expect(paraCentavos(null)).toBeNull();
    expect(() => paraCentavos("doze")).toThrow();
    expect(() => paraCentavos("1,234")).toThrow();
  });

  it("formata para a tela e para o campo", () => {
    expect(formatarReais(192000)).toMatch(/R\$\s?1\.920,00/);
    expect(formatarReais(null)).toBe("—");
    expect(centavosParaCampo(12590)).toBe("125,90");
  });
});

import { plural } from "@/lib/dinheiro";
describe("plural das unidades", () => {
  it.each([
    ["unidade", "unidades"],
    ["par", "pares"],
    ["aplicador", "aplicadores"],
    ["rolo", "rolos"],
  ])("%s → %s", (a, b) => expect(plural(a)).toBe(b));
});
