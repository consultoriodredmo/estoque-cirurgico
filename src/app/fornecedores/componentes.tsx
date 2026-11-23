"use client";
import { useActionState, useState, useTransition } from "react";
import { Aviso, Botao, Campo } from "@/components/ui";
import type { Resultado } from "@/lib/acao";
import { acaoAtivoFornecedor, acaoCriarFornecedor, acaoSalvarFornecedor } from "./acoes";

type Fornecedor = {
  id: number;
  nome: string;
  cnpj: string | null;
  contato: string | null;
  telefone: string | null;
  email: string | null;
  observacao: string | null;
  ativo: boolean;
};

function Campos({ f }: { f?: Fornecedor }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Campo rotulo="Nome" name="nome" defaultValue={f?.nome} required minLength={2} />
      </div>
      <Campo rotulo="CNPJ" name="cnpj" defaultValue={f?.cnpj ?? ""} inputMode="numeric" />
      <Campo rotulo="Pessoa de contato" name="contato" defaultValue={f?.contato ?? ""} />
      <Campo rotulo="Telefone / WhatsApp" name="telefone" defaultValue={f?.telefone ?? ""} inputMode="tel" />
      <Campo rotulo="E-mail" name="email" type="email" defaultValue={f?.email ?? ""} />
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="font-medium">Observação</span>
        <textarea name="observacao" defaultValue={f?.observacao ?? ""} rows={2} className="rounded-lg border border-neutral-300 px-3 py-2 text-base" />
      </label>
    </div>
  );
}

export function NovoFornecedor() {
  const [estado, enviar, enviando] = useActionState<Resultado | null, FormData>(acaoCriarFornecedor, null);
  return (
    <details className="rounded-xl border border-neutral-200 bg-white p-5" open={estado?.ok === false}>
      <summary className="cursor-pointer font-semibold">Novo fornecedor</summary>
      <form action={enviar} className="mt-4 flex flex-col gap-4">
        <Campos />
        {estado && <Aviso tipo={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Aviso>}
        <Botao type="submit" disabled={enviando} className="self-start">
          {enviando ? "Salvando…" : "Cadastrar fornecedor"}
        </Botao>
      </form>
    </details>
  );
}

export function CartaoFornecedor({ f }: { f: Fornecedor }) {
  const [editando, setEditando] = useState(false);
  const [estado, enviar, enviando] = useActionState<Resultado | null, FormData>(acaoSalvarFornecedor.bind(null, f.id), null);
  const [pendente, iniciar] = useTransition();
  const [r, setR] = useState<Resultado | null>(null);

  return (
    <li className={`flex flex-col gap-3 rounded-xl border bg-white p-4 ${f.ativo ? "border-neutral-200" : "border-dashed border-neutral-300 opacity-70"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-sm">
          <p className="font-semibold">
            {f.nome} {!f.ativo && <span className="text-xs font-normal text-red-700">(desativado)</span>}
          </p>
          <p className="text-neutral-600">{[f.contato, f.telefone, f.email].filter(Boolean).join(" · ") || "Sem contato cadastrado"}</p>
          {f.cnpj && <p className="text-xs text-neutral-500">CNPJ {f.cnpj}</p>}
        </div>
        <div className="flex gap-2">
          <Botao variante="secundario" className="px-3 py-1" onClick={() => setEditando(!editando)}>
            {editando ? "Fechar" : "Editar"}
          </Botao>
          <Botao
            variante={f.ativo ? "perigo" : "secundario"}
            className="px-3 py-1"
            disabled={pendente}
            onClick={() => iniciar(async () => setR(await acaoAtivoFornecedor(f.id, !f.ativo)))}
          >
            {f.ativo ? "Desativar" : "Reativar"}
          </Botao>
        </div>
      </div>
      {editando && (
        <form action={enviar} className="flex flex-col gap-3 border-t border-neutral-100 pt-3">
          <Campos f={f} />
          {estado && <Aviso tipo={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Aviso>}
          <Botao type="submit" disabled={enviando} className="self-start">
            Salvar
          </Botao>
        </form>
      )}
      {r && !r.ok && <Aviso>{r.mensagem}</Aviso>}
    </li>
  );
}
