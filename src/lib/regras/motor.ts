/**
 * Motor de regras de kit: função pura, sem banco, fácil de testar.
 *
 * Em cada GRUPO (kit vibrolipo, cola, peças compressivas…) vale só UMA regra:
 * a de maior prioridade que combinar com a cirurgia; no empate, a mais
 * específica. Assim "mamoplastia + abdominoplastia → 5 frascos" vence
 * "mamoplastia → 3" e nada é somado em dobro.
 *
 * Grupo "pendente quando sem regra": se nenhuma regra combinar, a tela mostra
 * pendência em vez de inventar quantidade (especificação, seção 5).
 */

export const GRUPOS = {
  kit_vibrolipo: { nome: "Kit vibrolipo", semRegra: "nada" },
  viaro: { nome: "Cânula Viaro (enxerto)", semRegra: "nada" },
  canula_azul: { nome: "Cânula azul (lipo axilar)", semRegra: "nada" },
  renuvion: { nome: "Renuvion", semRegra: "nada" },
  cola: { nome: "Cola cirúrgica", semRegra: "pendente" },
  compressiva: { nome: "Peças compressivas", semRegra: "pendente" },
  meia: { nome: "Meia de compressão", semRegra: "nada" },
  acolhimento: { nome: "Acolhimento", semRegra: "nada" },
} as const satisfies Record<string, { nome: string; semRegra: "nada" | "pendente" }>;

export type Grupo = keyof typeof GRUPOS;
export const LISTA_GRUPOS = Object.keys(GRUPOS) as Grupo[];

export type ProcedimentoMarcado = { codigo: string; tipo: string };

export type RegraMotor = {
  id: number;
  grupo: string;
  descricao: string;
  todos: string[];
  algum: string[];
  nenhum: string[];
  somente: boolean;
  prioridade: number;
  provisoria: boolean;
  ativo: boolean;
  itens: { produtoId: number; quantidade: number }[];
};

export type ResultadoGrupo = {
  grupo: Grupo;
  regra: RegraMotor;
};

export type Pendencia = { grupo: Grupo; motivo: "sem_regra" | "conflito"; regras?: number[] };

export type Previsao = {
  /** Regra aplicada em cada grupo (inclusive regras "não usa", sem itens). */
  aplicadas: ResultadoGrupo[];
  /** Soma por produto das regras aplicadas. */
  itens: { produtoId: number; quantidade: number; provisoria: boolean; grupos: Grupo[] }[];
  pendencias: Pendencia[];
};

export function regraCombina(regra: RegraMotor, marcados: ProcedimentoMarcado[]): boolean {
  const codigos = new Set(marcados.map((m) => m.codigo));
  if (!regra.todos.every((c) => codigos.has(c))) return false;
  if (regra.algum.length && !regra.algum.some((c) => codigos.has(c))) return false;
  if (regra.nenhum.some((c) => codigos.has(c))) return false;
  if (regra.somente) {
    const permitidos = new Set([...regra.todos, ...regra.algum]);
    // Complementos (lipo axilar) e tecnologias (Renuvion) não contam aqui.
    if (marcados.some((m) => m.tipo === "procedimento" && !permitidos.has(m.codigo))) return false;
  }
  return true;
}

function especificidade(r: RegraMotor): number {
  return r.todos.length + (r.algum.length ? 1 : 0) + r.nenhum.length + (r.somente ? 1 : 0);
}

function mesmosItens(a: RegraMotor, b: RegraMotor): boolean {
  const chave = (r: RegraMotor) =>
    [...r.itens]
      .sort((x, y) => x.produtoId - y.produtoId)
      .map((i) => `${i.produtoId}:${i.quantidade}`)
      .join(",");
  return chave(a) === chave(b);
}

export function calcularPrevisao(marcados: ProcedimentoMarcado[], regras: RegraMotor[]): Previsao {
  const aplicadas: ResultadoGrupo[] = [];
  const pendencias: Pendencia[] = [];

  for (const grupo of LISTA_GRUPOS) {
    const candidatas = regras
      .filter((r) => r.ativo && r.grupo === grupo && regraCombina(r, marcados))
      .sort((a, b) => b.prioridade - a.prioridade || especificidade(b) - especificidade(a) || a.id - b.id);
    if (!candidatas.length) {
      if (GRUPOS[grupo].semRegra === "pendente") pendencias.push({ grupo, motivo: "sem_regra" });
      continue;
    }
    const [primeira, segunda] = candidatas;
    const empate =
      segunda &&
      segunda.prioridade === primeira.prioridade &&
      especificidade(segunda) === especificidade(primeira) &&
      !mesmosItens(primeira, segunda);
    if (empate) {
      // Duas regras igualmente fortes dizendo coisas diferentes: não escolher no chute.
      pendencias.push({ grupo, motivo: "conflito", regras: [primeira.id, segunda.id] });
      continue;
    }
    aplicadas.push({ grupo, regra: primeira });
  }

  const soma = new Map<number, { quantidade: number; provisoria: boolean; grupos: Grupo[] }>();
  for (const a of aplicadas) {
    for (const i of a.regra.itens) {
      const atual = soma.get(i.produtoId) ?? { quantidade: 0, provisoria: false, grupos: [] };
      atual.quantidade += i.quantidade;
      atual.provisoria ||= a.regra.provisoria;
      atual.grupos.push(a.grupo);
      soma.set(i.produtoId, atual);
    }
  }
  return {
    aplicadas,
    itens: [...soma].map(([produtoId, v]) => ({ produtoId, ...v })),
    pendencias,
  };
}
