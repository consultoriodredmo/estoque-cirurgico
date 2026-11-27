"use client";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Aviso, Botao, Campo } from "@/components/ui";
import type { Resultado } from "@/lib/acao";
import { acaoCriarCirurgia, acaoSalvarCirurgia } from "./acoes";

export type OpcoesFormulario = {
  procedimentos: { codigo: string; nome: string; tipo: string }[];
  chinelos: { id: number; nome: string }[];
};

export type ValoresCirurgia = {
  id: number;
  paciente: string;
  data: string;
  hora: string | null;
  procedimentos: { codigo: string }[];
  chineloVarianteId: number | null;
  observacao: string | null;
};

export function FormularioCirurgia({ opcoes, cirurgia, dataInicial }: { opcoes: OpcoesFormulario; cirurgia?: ValoresCirurgia; dataInicial?: string }) {
  const router = useRouter();
  const [estado, enviar, enviando] = useActionState<Resultado | null, FormData>(async (anterior, form) => {
    const r = cirurgia ? await acaoSalvarCirurgia(cirurgia.id, anterior, form) : await acaoCriarCirurgia(anterior, form);
    if (r.ok && !cirurgia && r.id) router.push(`/cirurgias/${r.id}`);
    return r;
  }, null);
  const marcados = new Set(cirurgia?.procedimentos.map((p) => p.codigo));
  const grupos = [
    { titulo: "Procedimentos", itens: opcoes.procedimentos.filter((p) => p.tipo === "procedimento") },
    { titulo: "Tecnologias", itens: opcoes.procedimentos.filter((p) => p.tipo === "tecnologia") },
  ];

  return (
    <form action={enviar} className="flex flex-col gap-4">
      <Campo rotulo="Nome completo da paciente" name="paciente" defaultValue={cirurgia?.paciente} required minLength={5} autoComplete="off" />
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Data" name="data" type="date" defaultValue={cirurgia?.data ?? dataInicial} required />
        <Campo rotulo="Hora (opcional)" name="hora" type="time" defaultValue={cirurgia?.hora ?? ""} />
      </div>
      {grupos.map(
        (g) =>
          g.itens.length > 0 && (
            <fieldset key={g.titulo} className="flex flex-col gap-2 text-sm">
              <legend className="mb-1 font-medium">{g.titulo}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {g.itens.map((p) => (
                  <label key={p.codigo} className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 has-[:checked]:border-neutral-900 has-[:checked]:bg-neutral-50">
                    <input type="checkbox" name="procedimentos" value={p.codigo} defaultChecked={marcados.has(p.codigo)} className="size-4" />
                    {p.nome}
                  </label>
                ))}
              </div>
            </fieldset>
          ),
      )}
      {opcoes.chinelos.length > 0 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Tamanho do chinelo (se já souber)</span>
          <select name="chinelo" defaultValue={cirurgia?.chineloVarianteId ?? ""} className="rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base">
            <option value="">Não informado</option>
            {opcoes.chinelos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Observação (opcional)</span>
        <textarea name="observacao" defaultValue={cirurgia?.observacao ?? ""} rows={2} maxLength={300} className="rounded-lg border border-neutral-300 px-3 py-2 text-base" />
        <span className="text-xs text-neutral-500">Só informação operacional. Não escreva dados clínicos da paciente.</span>
      </label>
      {estado && !(estado.ok && !cirurgia) && <Aviso tipo={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Aviso>}
      <Botao type="submit" disabled={enviando} className="self-start">
        {enviando ? "Salvando…" : cirurgia ? "Salvar alterações" : "Cadastrar cirurgia"}
      </Botao>
    </form>
  );
}
