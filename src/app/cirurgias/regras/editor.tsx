"use client";
import { useActionState, useTransition } from "react";
import { Aviso, Botao, Campo } from "@/components/ui";
import type { Resultado } from "@/lib/acao";
import { acaoAtivoRegra, acaoCriarRegra, acaoSalvarRegra } from "./acoes";

export type OpcoesEditor = {
  grupos: { codigo: string; nome: string }[];
  procedimentos: { codigo: string; nome: string; tipo: string }[];
  produtos: { id: number; nome: string; unidade: string }[];
};

export type RegraEditavel = {
  id: number;
  grupo: string;
  descricao: string;
  todos: string[];
  algum: string[];
  nenhum: string[];
  somente: boolean;
  prioridade: number;
  provisoria: boolean;
  itens: { produtoId: number; quantidade: number }[];
};

function Marcar({ titulo, dica, nome, opcoes, marcados }: { titulo: string; dica: string; nome: string; opcoes: OpcoesEditor["procedimentos"]; marcados: string[] }) {
  return (
    <details className="rounded-lg border border-neutral-200 p-3" open={marcados.length > 0}>
      <summary className="cursor-pointer text-sm font-medium">
        {titulo} {marcados.length > 0 && <span className="text-neutral-500">({marcados.length})</span>}
      </summary>
      <p className="mt-1 text-xs text-neutral-500">{dica}</p>
      <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
        {opcoes.map((p) => (
          <label key={p.codigo} className="flex items-center gap-2">
            <input type="checkbox" name={nome} value={p.codigo} defaultChecked={marcados.includes(p.codigo)} className="size-4" />
            {p.nome}
          </label>
        ))}
      </div>
    </details>
  );
}

export function EditorRegra({ opcoes, regra }: { opcoes: OpcoesEditor; regra?: RegraEditavel }) {
  const [estado, enviar, enviando] = useActionState<Resultado | null, FormData>(
    regra ? acaoSalvarRegra.bind(null, regra.id) : acaoCriarRegra,
    null,
  );
  const qtd = new Map(regra?.itens.map((i) => [i.produtoId, i.quantidade]));
  return (
    <form action={enviar} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Grupo</span>
        <select name="grupo" defaultValue={regra?.grupo ?? "cola"} className="rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base">
          {opcoes.grupos.map((g) => (
            <option key={g.codigo} value={g.codigo}>
              {g.nome}
            </option>
          ))}
        </select>
        <span className="text-xs text-neutral-500">Em cada grupo vale só uma regra por cirurgia: a de maior prioridade que combinar.</span>
      </label>
      <Campo rotulo="Descrição" name="descricao" defaultValue={regra?.descricao} required minLength={5} placeholder="Ex.: Mamoplastia com prótese isolada: 3 aplicadores" />
      <Marcar titulo="Exige TODOS estes" dica="A regra só vale se todos estiverem marcados na cirurgia." nome="todos" opcoes={opcoes.procedimentos} marcados={regra?.todos ?? []} />
      <Marcar titulo="Exige PELO MENOS UM destes" dica="Basta um deles estar marcado." nome="algum" opcoes={opcoes.procedimentos} marcados={regra?.algum ?? []} />
      <Marcar titulo="NENHUM destes" dica="A regra não vale se algum deles estiver marcado." nome="nenhum" opcoes={opcoes.procedimentos} marcados={regra?.nenhum ?? []} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="somente" defaultChecked={regra?.somente} className="mt-0.5 size-4" />
        <span>
          <strong>Somente esses procedimentos</strong> (cirurgia “isolada”). Complementos e tecnologias não contam.
        </span>
      </label>
      <fieldset className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3 text-sm">
        <legend className="px-1 font-medium">Materiais previstos</legend>
        <p className="text-xs text-neutral-500">Deixe em branco o que não entra. Regra sem nenhum material = “não usa” (resolve a pendência do grupo).</p>
        {opcoes.produtos.map((p) => (
          <label key={p.id} className="grid grid-cols-[1fr_4.5rem] items-center gap-2">
            <span>{p.nome}</span>
            <input name={`item_${p.id}`} inputMode="numeric" defaultValue={qtd.get(p.id) ?? ""} placeholder="—" className="rounded-lg border border-neutral-300 px-2 py-1.5 text-right text-base" />
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Prioridade" name="prioridade" type="number" min={0} max={1000} defaultValue={regra?.prioridade ?? 10} dica="Maior vence no grupo." />
        <label className="flex items-center gap-2 self-center text-sm">
          <input type="checkbox" name="provisoria" defaultChecked={regra?.provisoria} className="size-4" />
          Quantidade a confirmar
        </label>
      </div>
      {estado && <Aviso tipo={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Aviso>}
      <Botao type="submit" disabled={enviando} className="self-start">
        {enviando ? "Salvando…" : regra ? "Salvar regra" : "Cadastrar regra"}
      </Botao>
    </form>
  );
}

export function AlternarRegra({ id, ativo }: { id: number; ativo: boolean }) {
  const [pendente, iniciar] = useTransition();
  return (
    <Botao variante={ativo ? "perigo" : "secundario"} className="px-3 py-1" disabled={pendente} onClick={() => iniciar(async () => void (await acaoAtivoRegra(id, !ativo)))}>
      {ativo ? "Desativar" : "Reativar"}
    </Botao>
  );
}
