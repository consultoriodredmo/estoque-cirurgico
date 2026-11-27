"use client";
import { useActionState, useState } from "react";
import { Aviso, Botao } from "@/components/ui";
import type { Resultado } from "@/lib/acao";
import { acaoRegistrarContagem } from "../acoes";

type Item = {
  varianteId: number;
  produtoId: number;
  produto: string;
  tamanho: string;
  unidade: string;
  doLocal: boolean;
  saldo: number;
};

export function FormularioContagem({
  idInicial,
  local,
  tipoSugerido,
  itens,
  editaCusto,
}: {
  idInicial: string;
  local: string;
  tipoSugerido: "implantacao" | "ajuste";
  itens: Item[];
  editaCusto: boolean;
}) {
  // Cada lançamento tem um identificador; enviar duas vezes o mesmo não duplica.
  const [id, setId] = useState(idInicial);
  const [versao, setVersao] = useState(0);
  const [contados, setContados] = useState<Record<number, string>>({});
  const [estado, enviar, enviando] = useActionState<Resultado | null, FormData>(async (anterior, form) => {
    const r = await acaoRegistrarContagem(anterior, form);
    if (r.ok) {
      setId(crypto.randomUUID());
      setContados({});
      setVersao((v) => v + 1);
    }
    return r;
  }, null);

  const grupos = new Map<number, Item[]>();
  for (const i of itens) grupos.set(i.produtoId, [...(grupos.get(i.produtoId) ?? []), i]);
  const preenchidos = Object.values(contados).filter((v) => v.trim() !== "").length;

  return (
    <form action={enviar} key={versao} className="flex flex-col gap-5">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="local" value={local} />

      <fieldset className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4 text-sm">
        <legend className="px-1 font-semibold">Tipo de lançamento</legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="tipo" value="implantacao" defaultChecked={tipoSugerido === "implantacao"} className="mt-1" />
          <span>
            <strong>Carga inicial</strong> — primeira contagem deste local no sistema.
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="tipo" value="ajuste" defaultChecked={tipoSugerido === "ajuste"} className="mt-1" />
          <span>
            <strong>Ajuste por contagem</strong> — a contagem física diferiu do sistema.
          </span>
        </label>
      </fieldset>

      <p className="text-sm text-neutral-600">
        Digite a quantidade <strong>contada</strong> de cada tamanho. O sistema lança só a diferença. Deixe em branco o que não foi contado.
        {editaCusto && " O custo unitário é opcional e só vale para quantidades que aumentaram."}
      </p>

      <ul className="flex flex-col gap-3">
        {[...grupos.values()].map((g) => (
          <li key={g[0].produtoId} className={`rounded-xl border bg-white p-4 ${g[0].doLocal ? "border-neutral-300" : "border-dashed border-neutral-200"}`}>
            <p className="font-semibold">
              {g[0].produto}
              {!g[0].doLocal && <span className="ml-2 text-xs font-normal text-neutral-500">(normalmente fica em outro local)</span>}
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {g.map((i) => {
                const v = contados[i.varianteId] ?? "";
                const diff = v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v) - i.saldo;
                return (
                  <div key={i.varianteId} className={`grid items-center gap-2 text-sm ${editaCusto ? "grid-cols-[1fr_4.5rem_5.5rem] sm:grid-cols-[1fr_6rem_7rem]" : "grid-cols-[1fr_5.5rem]"}`}>
                    <span>
                      {i.tamanho} <span className="text-neutral-500">· sistema: {i.saldo}</span>
                      {diff != null && diff !== 0 && (
                        <span className={`ml-2 font-semibold ${diff > 0 ? "text-green-700" : "text-red-700"}`}>
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      )}
                    </span>
                    <input
                      name={`contado_${i.varianteId}`}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      aria-label={`Contado de ${i.produto} ${i.tamanho}`}
                      placeholder="contado"
                      value={v}
                      onChange={(e) => setContados({ ...contados, [i.varianteId]: e.target.value })}
                      className="min-w-0 rounded-lg border border-neutral-300 px-2 py-2 text-right text-base"
                    />
                    {editaCusto && (
                      <input
                        name={`custo_${i.varianteId}`}
                        inputMode="decimal"
                        aria-label={`Custo unitário de ${i.produto} ${i.tamanho}`}
                        placeholder="R$/un."
                        className="min-w-0 rounded-lg border border-neutral-200 px-2 py-2 text-right text-base"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Motivo / observação</span>
        <textarea
          name="motivo"
          required
          minLength={5}
          rows={2}
          placeholder="Ex.: carga inicial do armário em 27/11; contagem de segunda-feira"
          className="rounded-lg border border-neutral-300 px-3 py-2 text-base"
        />
      </label>

      {estado && <Aviso tipo={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Aviso>}
      <Botao type="submit" disabled={enviando || preenchidos === 0} className="self-start">
        {enviando ? "Registrando…" : `Registrar ${preenchidos || ""} ${preenchidos === 1 ? "contagem" : "contagens"}`.replace("  ", " ")}
      </Botao>
    </form>
  );
}
