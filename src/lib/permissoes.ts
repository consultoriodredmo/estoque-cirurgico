/**
 * Perfis e permissões (seção 5 do plano). Esta tabela é a ÚNICA fonte da
 * verdade: o servidor consulta `pode()` antes de qualquer ação, e os testes
 * conferem cada linha.
 */
export const PERFIS = ["administrador", "compras", "hospital"] as const;
export type Perfil = (typeof PERFIS)[number];

export const NOME_PERFIL: Record<Perfil, string> = {
  administrador: "Administrador",
  compras: "Compras e estoque central",
  hospital: "Hospital",
};

export const ACOES = [
  "cirurgias:ver",
  "consumo:confirmar",
  "contagem:registrar",
  "transferencia:receber",
  "produtos:ver",
  "produtos:editar",
  "fornecedores:editar",
  "compras:gerir",
  "transferencia:aprovar",
  "ajuste:solicitar",
  "ajuste:fazer",
  "custos:editar",
  "valores:ver",
  "estoque:ver",
  "relatorios:ver",
  "regras:editar",
  "usuarios:gerir",
  "configuracoes:gerir",
  "auditoria:ver",
] as const;
export type Acao = (typeof ACOES)[number];

const MATRIZ: Record<Perfil, ReadonlySet<Acao>> = {
  administrador: new Set(ACOES),
  compras: new Set<Acao>([
    "cirurgias:ver",
    "produtos:ver",
    "produtos:editar",
    "fornecedores:editar",
    "compras:gerir",
    "transferencia:aprovar",
    "ajuste:solicitar",
    "ajuste:fazer", // decisão 5: Mariana ajusta sem aprovação, sempre com registro
    "custos:editar",
    "valores:ver",
    "estoque:ver",
    "relatorios:ver",
  ]),
  hospital: new Set<Acao>([
    "cirurgias:ver",
    "consumo:confirmar",
    "contagem:registrar",
    "transferencia:receber",
    "produtos:ver",
    "ajuste:solicitar",
    "estoque:ver", // decisão 6: só quantidades, nenhum valor
  ]),
};

export function ehPerfil(valor: unknown): valor is Perfil {
  return typeof valor === "string" && (PERFIS as readonly string[]).includes(valor);
}

/** Perfil desconhecido ou ausente não pode nada. */
export function pode(perfil: unknown, acao: Acao): boolean {
  return ehPerfil(perfil) && MATRIZ[perfil].has(acao);
}
