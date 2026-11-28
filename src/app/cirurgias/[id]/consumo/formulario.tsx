"use client";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Aviso, Botao } from "@/components/ui";
import type { Resultado } from "@/lib/acao";
import { acaoConfirmarConsumo } from "./acoes";

type Local = "consultorio" | "farmacia" | "armario";
export type Material = {
  id: number;
  nome: string;
  unidade: string;
  localPadrao: string | null;
  tamanhos: { id: number; nome: string; saldo: Record<Local, number> }[];
};
export type LinhaInicial = { produtoId: number; varianteId: number | null; quantidade: number; previsto: boolean; dica?: string };

type Linha = LinhaInicial & { chave: number; local: Local };

const LOCAIS: Local[] = ["farmacia", "armario", "consultorio"];
const CURTO: Record<Local, string> = { farmacia: "Farmácia", armario: "Armário", consultorio: "Consultório" };

export function FormularioConsumo({
  cirurgiaId,
  idInicial,
  materiais,
  iniciais,
  pendencias,
}: {
  cirurgiaId: number;
  idInicial: string;
  materiais: Material[];
  iniciais: LinhaInicial[];
  pendencias: string[];
}) {
  const router = useRouter();
  const porId = new Map(materiais.map((m) => [m.id, m]));
  const localDe = (produtoId: number): Local => (porId.get(produtoId)?.localPadrao as Local) ?? "armario";
  const [seq, setSeq] = useState(iniciais.length);
  const [linhas, setLinhas] = useState<Linha[]>(iniciais.map((l, i) => ({ ...l, chave: i, local: localDe(l.produtoId) })));
  const [novo, setNovo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [estado, enviar, enviando] = useActionState<Resultado | null, FormData>(async (anterior, form) => {
    const r = await acaoConfirmarConsumo(cirurgiaId, anterior, form);
    if (r.ok) router.push(`/cirurgias/${cirurgiaId}?consumo=ok`);
    return r;
  }, null);

  const mudar = (chave: number, campos: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...campos } : l)));
  const adicionar = (produtoId: number, depoisDe?: number) => {
    const m = porId.get(produtoId);
    if (!m) return;
    const nova: Linha = {
      chave: seq,
      produtoId,
      varianteId: m.tamanhos.length === 1 ? m.tamanhos[0].id : null,
      quantidade: 1,
      previsto: false,
      local: localDe(produtoId),
      dica: depoisDe != null ? "Outro tamanho" : undefined,
    };
    setSeq(seq + 1);
    setLinhas((ls) => {
      const i = depoisDe == null ? -1 : ls.findIndex((l) => l.chave === depoisDe);
      return i < 0 ? [...ls, nova] : [...ls.slice(0, i + 1), nova, ...ls.slice(i + 1)];
    });
  };

  const usadas = linhas.filter((l) => l.quantidade > 0);
  const semTamanho = usadas.filter((l) => l.varianteId == null);

  return (
    <form
      action={enviar}
      onSubmit={(e) => {
        if (semTamanho.length) {
          e.preventDefault();
          setAviso(`Escolha o tamanho de: ${semTamanho.map((l) => porId.get(l.produtoId)?.nome).join(", ")}.`);
        } else setAviso(null);
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="id" value={idInicial} />
      <input type="hidden" name="linhas" value={JSON.stringify(usadas.map(({ varianteId, local, quantidade }) => ({ varianteId, local, quantidade })))} />

      {pendencias.length > 0 && (
        <Aviso tipo="info">
          Sem regra para: {pendencias.join(", ")}. Se usou, acrescente em “Outro material” abaixo.
        </Aviso>
      )}

      <ul className="flex flex-col gap-2">
        {linhas.map((l) => {
          const m = porId.get(l.produtoId)!;
          const t = m.tamanhos.find((x) => x.id === l.varianteId);
          return (
            <li key={l.chave} className={`flex flex-col gap-2 rounded-xl border bg-white p-3 ${l.quantidade === 0 ? "border-neutral-200 opacity-70" : "border-neutral-300"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm">
                  <p className="font-semibold">{m.nome}</p>
                  {l.dica && <p className="text-xs text-neutral-500">{l.dica}</p>}
                  {!l.previsto && !l.dica && <p className="text-xs text-sky-700">Extra (não previsto)</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" aria-label={`Menos ${m.nome}`} onClick={() => mudar(l.chave, { quantidade: Math.max(0, l.quantidade - 1) })} className="size-10 rounded-lg border border-neutral-300 text-lg">
                    −
                  </button>
                  <span className="w-8 text-center text-lg font-semibold tabular-nums">{l.quantidade}</span>
                  <button type="button" aria-label={`Mais ${m.nome}`} onClick={() => mudar(l.chave, { quantidade: l.quantidade + 1 })} className="size-10 rounded-lg border border-neutral-300 text-lg">
                    +
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {m.tamanhos.length > 1 && (
                  <select
                    aria-label={`Tamanho de ${m.nome}`}
                    value={l.varianteId ?? ""}
                    onChange={(e) => mudar(l.chave, { varianteId: e.target.value ? Number(e.target.value) : null })}
                    className={`rounded-lg border bg-white px-2 py-2 text-base ${l.quantidade > 0 && l.varianteId == null ? "border-amber-500" : "border-neutral-300"}`}
                  >
                    <option value="">Tamanho…</option>
                    {m.tamanhos.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nome}
                      </option>
                    ))}
                  </select>
                )}
                <select aria-label={`Local de ${m.nome}`} value={l.local} onChange={(e) => mudar(l.chave, { local: e.target.value as Local })} className="rounded-lg border border-neutral-300 bg-white px-2 py-2 text-base">
                  {LOCAIS.map((x) => (
                    <option key={x} value={x}>
                      {CURTO[x]}
                    </option>
                  ))}
                </select>
                {t && <span className={`text-xs ${t.saldo[l.local] < l.quantidade ? "text-red-700" : "text-neutral-500"}`}>saldo: {t.saldo[l.local]}</span>}
                {m.tamanhos.length > 1 && (
                  <button type="button" onClick={() => adicionar(l.produtoId, l.chave)} className="text-xs font-semibold text-neutral-700 underline">
                    + outro tamanho
                  </button>
                )}
                {!l.previsto && (
                  <button type="button" onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))} className="text-xs text-red-700 underline">
                    remover
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex gap-2">
        <select value={novo} onChange={(e) => setNovo(e.target.value)} aria-label="Outro material" className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-2 py-2.5 text-base">
          <option value="">Outro material…</option>
          {materiais.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </select>
        <Botao
          type="button"
          variante="secundario"
          disabled={!novo}
          onClick={() => {
            adicionar(Number(novo));
            setNovo("");
          }}
        >
          Adicionar
        </Botao>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Observação (opcional)</span>
        <textarea name="observacao" rows={2} maxLength={300} placeholder="Só informação operacional" className="rounded-lg border border-neutral-300 px-3 py-2 text-base" />
      </label>

      <p className="text-xs text-neutral-500">
        Informe só o que foi <strong>usado</strong>. Material retirado da farmácia e devolvido sem uso não entra. Saldo insuficiente não impede a confirmação: fica registrado como exceção para a contagem de segunda-feira.
      </p>
      {aviso && <Aviso>{aviso}</Aviso>}
      {estado && !estado.ok && <Aviso>{estado.mensagem}</Aviso>}
      <Botao type="submit" disabled={enviando || usadas.length === 0} className="py-3 text-base">
        {enviando ? "Confirmando…" : `Confirmar consumo (${usadas.reduce((s, l) => s + l.quantidade, 0)} itens)`}
      </Botao>
    </form>
  );
}
