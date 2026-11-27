"use client";
import { useActionState, useTransition } from "react";
import { Aviso, Botao, Campo } from "@/components/ui";
import type { Resultado } from "@/lib/acao";
import { acaoAtivoProcedimento, acaoCriarProcedimento } from "../acoes";

export function AlternarProcedimento({ codigo, ativo }: { codigo: string; ativo: boolean }) {
  const [pendente, iniciar] = useTransition();
  return (
    <Botao variante={ativo ? "perigo" : "secundario"} className="px-3 py-1" disabled={pendente} onClick={() => iniciar(async () => void (await acaoAtivoProcedimento(codigo, !ativo)))}>
      {ativo ? "Desativar" : "Reativar"}
    </Botao>
  );
}

export function NovoProcedimento() {
  const [estado, enviar, enviando] = useActionState<Resultado | null, FormData>(acaoCriarProcedimento, null);
  return (
    <details className="rounded-xl border border-neutral-200 bg-white p-5" open={estado?.ok === false}>
      <summary className="cursor-pointer font-semibold">Novo procedimento ou tecnologia</summary>
      <form action={enviar} className="mt-4 flex flex-col gap-3">
        <Campo rotulo="Nome" name="nome" required minLength={3} />
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="tipo" value="procedimento" defaultChecked /> Procedimento
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="tipo" value="tecnologia" /> Tecnologia
          </label>
        </div>
        {estado && <Aviso tipo={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Aviso>}
        <Botao type="submit" disabled={enviando} className="self-start">
          {enviando ? "Salvando…" : "Cadastrar"}
        </Botao>
      </form>
    </details>
  );
}
