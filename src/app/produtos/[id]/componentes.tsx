"use client";
import { useActionState, useState, useTransition } from "react";
import { Aviso, Botao, Campo } from "@/components/ui";
import type { Resultado } from "@/lib/acao";
import { centavosParaCampo, formatarReais, plural } from "@/lib/dinheiro";
import {
  acaoAtivoProduto,
  acaoAtivoTamanho,
  acaoDesvincular,
  acaoNovoTamanho,
  acaoSalvarCondicoes,
  acaoSalvarProduto,
  acaoSalvarTamanho,
} from "../acoes";
import { CamposProduto, type ValoresProduto } from "../campos-produto";

function Retorno({ r }: { r: Resultado | null }) {
  if (!r) return null;
  return <Aviso tipo={r.ok ? "ok" : "erro"}>{r.mensagem}</Aviso>;
}

export function EditarProduto({ id, valores }: { id: number; valores: ValoresProduto }) {
  const [estado, enviar, enviando] = useActionState<Resultado | null, FormData>(acaoSalvarProduto.bind(null, id), null);
  return (
    <form action={enviar} className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-5">
      <CamposProduto v={valores} />
      <Retorno r={estado} />
      <Botao type="submit" disabled={enviando} className="self-start">
        {enviando ? "Salvando…" : "Salvar alterações"}
      </Botao>
    </form>
  );
}

export function BotaoAtivoProduto({ id, ativo }: { id: number; ativo: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [r, setR] = useState<Resultado | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Botao
        variante={ativo ? "perigo" : "secundario"}
        className="px-3 py-1.5"
        disabled={pendente}
        onClick={() => {
          if (ativo && !window.confirm("Desativar este produto? Ele some das listas, mas o histórico fica guardado.")) return;
          iniciar(async () => setR(await acaoAtivoProduto(id, !ativo)));
        }}
      >
        {ativo ? "Desativar produto" : "Reativar produto"}
      </Botao>
      {r && !r.ok && <Aviso>{r.mensagem}</Aviso>}
    </div>
  );
}

type Tamanho = { id: number; nome: string; codigoBarras: string | null; ativo: boolean };

function LinhaTamanho({ produtoId, t, podeEditar }: { produtoId: number; t: Tamanho; podeEditar: boolean }) {
  const [editando, setEditando] = useState(false);
  const [estado, enviar, enviando] = useActionState<Resultado | null, FormData>(
    acaoSalvarTamanho.bind(null, produtoId, t.id),
    null,
  );
  const [pendente, iniciar] = useTransition();
  const [r, setR] = useState<Resultado | null>(null);

  if (editando) {
    return (
      <li className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3">
        <form action={enviar} className="flex flex-wrap items-end gap-2">
          <div className="w-24">
            <Campo rotulo="Tamanho" name="nome" defaultValue={t.nome} required />
          </div>
          <div className="min-w-40 flex-1">
            <Campo rotulo="Código de barras" name="codigoBarras" defaultValue={t.codigoBarras ?? ""} inputMode="numeric" />
          </div>
          <Botao type="submit" disabled={enviando} className="px-3 py-2">
            Salvar
          </Botao>
          <Botao type="button" variante="secundario" className="px-3 py-2" onClick={() => setEditando(false)}>
            Fechar
          </Botao>
        </form>
        <Retorno r={estado} />
      </li>
    );
  }

  return (
    <li className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 ${t.ativo ? "border-neutral-200" : "border-dashed border-neutral-300 opacity-60"}`}>
      <div>
        <span className="font-medium">{t.nome}</span>
        {t.codigoBarras && <span className="ml-2 font-mono text-xs text-neutral-500">{t.codigoBarras}</span>}
        {!t.ativo && <span className="ml-2 text-xs text-red-700">desativado</span>}
      </div>
      {podeEditar && (
        <div className="flex gap-2">
          <Botao variante="secundario" className="px-3 py-1" onClick={() => setEditando(true)}>
            Editar
          </Botao>
          <Botao
            variante="secundario"
            className="px-3 py-1"
            disabled={pendente}
            onClick={() => iniciar(async () => setR(await acaoAtivoTamanho(produtoId, t.id, !t.ativo)))}
          >
            {t.ativo ? "Desativar" : "Reativar"}
          </Botao>
        </div>
      )}
      {r && !r.ok && (
        <div className="w-full">
          <Aviso>{r.mensagem}</Aviso>
        </div>
      )}
    </li>
  );
}

export function Tamanhos({ produtoId, tamanhos, podeEditar }: { produtoId: number; tamanhos: Tamanho[]; podeEditar: boolean }) {
  const [estado, enviar, enviando] = useActionState<Resultado | null, FormData>(acaoNovoTamanho.bind(null, produtoId), null);
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-5">
      <div>
        <h2 className="font-semibold">Tamanhos</h2>
        <p className="text-xs text-neutral-500">Cada tamanho tem estoque e alertas próprios.</p>
      </div>
      <ul className="flex flex-col gap-2">
        {tamanhos.map((t) => (
          <LinhaTamanho key={t.id} produtoId={produtoId} t={t} podeEditar={podeEditar} />
        ))}
      </ul>
      {podeEditar && (
        <form action={enviar} className="flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3">
          <div className="w-28">
            <Campo rotulo="Novo tamanho" name="nome" required />
          </div>
          <div className="min-w-40 flex-1">
            <Campo rotulo="Código de barras (opcional)" name="codigoBarras" inputMode="numeric" />
          </div>
          <Botao type="submit" disabled={enviando} className="px-3 py-2">
            Adicionar
          </Botao>
          <div className="w-full">
            <Retorno r={estado} />
          </div>
        </form>
      )}
    </section>
  );
}

type Vinculo = {
  id: number;
  fornecedorId: number;
  fornecedor: string;
  embalagem: string;
  unidadesPorEmbalagem: number;
  precoCentavos: number | null;
  prazoDias: number | null;
  loteMinimo: number | null;
  codigoNoFornecedor: string | null;
  ativo: boolean;
};

function FormCondicoes({
  produtoId,
  unidade,
  fornecedores,
  v,
  aoFechar,
}: {
  produtoId: number;
  unidade: string;
  fornecedores: { id: number; nome: string }[];
  v?: Vinculo;
  aoFechar?: () => void;
}) {
  const [estado, enviar, enviando] = useActionState<Resultado | null, FormData>(
    acaoSalvarCondicoes.bind(null, produtoId),
    null,
  );
  return (
    <form action={enviar} className="grid gap-3 sm:grid-cols-2">
      {v ? (
        <input type="hidden" name="fornecedorId" value={v.fornecedorId} />
      ) : (
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="font-medium">Fornecedor</span>
          <select name="fornecedorId" required defaultValue="" className="rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base">
            <option value="" disabled>
              Escolha…
            </option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </label>
      )}
      <Campo rotulo="Embalagem de compra" name="embalagem" defaultValue={v?.embalagem ?? "unidade"} required dica="unidade, caixa, pacote…" />
      <Campo
        rotulo={`Quantidade de ${plural(unidade)} na embalagem`}
        name="unidadesPorEmbalagem"
        type="number"
        min={1}
        defaultValue={v?.unidadesPorEmbalagem ?? 1}
        required
      />
      <Campo rotulo="Preço por embalagem (R$)" name="preco" inputMode="decimal" defaultValue={centavosParaCampo(v?.precoCentavos)} placeholder="0,00" />
      <Campo rotulo="Prazo de entrega (dias)" name="prazoDias" type="number" min={0} defaultValue={v?.prazoDias ?? ""} />
      <Campo rotulo="Pedido mínimo (embalagens)" name="loteMinimo" type="number" min={1} defaultValue={v?.loteMinimo ?? ""} />
      <Campo rotulo="Código no fornecedor" name="codigoNoFornecedor" defaultValue={v?.codigoNoFornecedor ?? ""} />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Retorno r={estado} />
        <div className="flex gap-2">
          <Botao type="submit" disabled={enviando}>
            {enviando ? "Salvando…" : "Salvar condições"}
          </Botao>
          {aoFechar && (
            <Botao type="button" variante="secundario" onClick={aoFechar}>
              Fechar
            </Botao>
          )}
        </div>
      </div>
    </form>
  );
}

function CartaoVinculo({ produtoId, unidade, v }: { produtoId: number; unidade: string; v: Vinculo }) {
  const [editando, setEditando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [r, setR] = useState<Resultado | null>(null);
  const porUnidade =
    v.precoCentavos != null && v.unidadesPorEmbalagem > 1
      ? ` (${formatarReais(Math.round(v.precoCentavos / v.unidadesPorEmbalagem))} por ${unidade})`
      : "";

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-sm">
          <p className="font-medium">{v.fornecedor}</p>
          <p className="text-neutral-600">
            {v.embalagem}
            {v.unidadesPorEmbalagem > 1 && ` com ${v.unidadesPorEmbalagem} ${plural(unidade)}`} · {formatarReais(v.precoCentavos)}
            {porUnidade}
          </p>
          <p className="text-xs text-neutral-500">
            Prazo: {v.prazoDias != null ? `${v.prazoDias} dias` : "—"} · Pedido mínimo: {v.loteMinimo ?? "—"}
            {v.codigoNoFornecedor && ` · Código: ${v.codigoNoFornecedor}`}
          </p>
        </div>
        {!editando && (
          <div className="flex gap-2">
            <Botao variante="secundario" className="px-3 py-1" onClick={() => setEditando(true)}>
              Editar
            </Botao>
            <Botao
              variante="secundario"
              className="px-3 py-1"
              disabled={pendente}
              onClick={() => {
                if (!window.confirm(`Retirar ${v.fornecedor} deste produto? O histórico de preços fica guardado.`)) return;
                iniciar(async () => setR(await acaoDesvincular(produtoId, v.id)));
              }}
            >
              Retirar
            </Botao>
          </div>
        )}
      </div>
      {editando && <FormCondicoes produtoId={produtoId} unidade={unidade} fornecedores={[]} v={v} aoFechar={() => setEditando(false)} />}
      {r && !r.ok && <Aviso>{r.mensagem}</Aviso>}
    </li>
  );
}

export function Fornecedores({
  produtoId,
  unidade,
  vinculos,
  todos,
}: {
  produtoId: number;
  unidade: string;
  vinculos: Vinculo[];
  todos: { id: number; nome: string }[];
}) {
  const ativos = vinculos.filter((v) => v.ativo);
  const usados = new Set(ativos.map((v) => v.fornecedorId));
  const disponiveis = todos.filter((f) => !usados.has(f.id));
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-5">
      <div>
        <h2 className="font-semibold">Fornecedores e preços</h2>
        <p className="text-xs text-neutral-500">Toda mudança de preço ou prazo fica no histórico.</p>
      </div>
      {ativos.length === 0 && <p className="text-sm text-neutral-500">Nenhum fornecedor para este produto ainda.</p>}
      <ul className="flex flex-col gap-2">
        {ativos.map((v) => (
          <CartaoVinculo key={v.id} produtoId={produtoId} unidade={unidade} v={v} />
        ))}
      </ul>
      <details className="border-t border-neutral-100 pt-3">
        <summary className="cursor-pointer text-sm font-medium">Adicionar fornecedor a este produto</summary>
        <div className="mt-3">
          {disponiveis.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Nenhum fornecedor disponível. Cadastre em{" "}
              <a href="/fornecedores" className="underline">
                Fornecedores
              </a>
              .
            </p>
          ) : (
            <FormCondicoes produtoId={produtoId} unidade={unidade} fornecedores={disponiveis} />
          )}
        </div>
      </details>
    </section>
  );
}
