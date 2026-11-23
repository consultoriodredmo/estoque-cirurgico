/** Valores em centavos (inteiros) para não haver erro de arredondamento. */

/** "1.234,56", "1234,56", "1234.56", "R$ 12" → centavos. Vazio → null. */
export function paraCentavos(texto: string | null | undefined): number | null {
  if (texto == null) return null;
  let t = String(texto).replace(/R\$|\s/g, "");
  if (t === "") return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) throw new Error(`Valor inválido: "${texto}"`);
  const [inteiro, frac = ""] = t.split(".");
  return Number(inteiro) * 100 + Number(frac.padEnd(2, "0"));
}

export function formatarReais(centavos: number | null | undefined): string {
  if (centavos == null) return "—";
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Valor em centavos como texto para campo de formulário ("12,50"). */
export function centavosParaCampo(centavos: number | null | undefined): string {
  if (centavos == null) return "";
  return (centavos / 100).toFixed(2).replace(".", ",");
}

/** Plural simples das unidades de estoque: unidade→unidades, par→pares, aplicador→aplicadores. */
export function plural(palavra: string): string {
  if (/[rz]$/i.test(palavra)) return `${palavra}es`;
  if (/m$/i.test(palavra)) return `${palavra.slice(0, -1)}ns`;
  if (/s$/i.test(palavra)) return palavra;
  return `${palavra}s`;
}
