import type { PrevisaoCompleta } from "@/lib/regras";
import { plural } from "@/lib/dinheiro";
import { NOME_LOCAL, Selo } from "./pagina";

const MOTIVO = { sem_regra: "nenhuma regra cadastrada para esta combinação", conflito: "duas regras se contradizem" } as const;

/** Lista de materiais previstos, com as pendências no topo. */
export function ListaPrevisao({ previsao }: { previsao: PrevisaoCompleta }) {
  const { linhas, pendencias, aplicadas } = previsao;
  const naoUsa = aplicadas.filter((a) => a.semItens);
  return (
    <div className="flex flex-col gap-3 text-sm">
      {pendencias.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
          {pendencias.map((p) => (
            <li key={p.grupo}>
              <strong>{p.nomeGrupo}:</strong> regra pendente — {MOTIVO[p.motivo]}. Informe na confirmação do consumo.
            </li>
          ))}
        </ul>
      )}
      {linhas.length === 0 && pendencias.length === 0 && <p className="text-neutral-500">Nenhum material previsto.</p>}
      <ul className="divide-y divide-neutral-100">
        {linhas.map((l) => (
          <li key={l.produtoId} className="flex items-start justify-between gap-3 py-2">
            <span>
              {l.produto}
              {l.tamanho && <span className="text-neutral-500"> · {l.tamanho}</span>}
              {l.localPadrao && <span className="block text-xs text-neutral-500">{NOME_LOCAL[l.localPadrao]}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-2 whitespace-nowrap">
              {l.provisoria && <Selo cor="ambar">a confirmar</Selo>}
              <strong className="tabular-nums">{l.quantidade}</strong>
              <span className="text-neutral-500">{l.quantidade === 1 ? l.unidade : plural(l.unidade)}</span>
            </span>
          </li>
        ))}
      </ul>
      {naoUsa.length > 0 && <p className="text-xs text-neutral-500">{naoUsa.map((a) => a.descricao).join(" · ")}</p>}
    </div>
  );
}
