"use client";
import { useActionState, useState, useTransition } from "react";
import { Aviso, Botao } from "@/components/ui";
import type { Resultado } from "@/lib/acao";
import { acaoCancelarCirurgia, acaoReativarCirurgia } from "../acoes";

export function CancelarOuReativar({ id, cancelada }: { id: number; cancelada: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [estado, enviar, enviando] = useActionState<Resultado | null, FormData>(acaoCancelarCirurgia.bind(null, id), null);
  const [pendente, iniciar] = useTransition();
  const [r, setR] = useState<Resultado | null>(null);

  if (cancelada) {
    return (
      <div className="flex flex-col gap-2">
        <Botao variante="secundario" className="self-start" disabled={pendente} onClick={() => iniciar(async () => setR(await acaoReativarCirurgia(id)))}>
          Reativar cirurgia
        </Botao>
        {r && !r.ok && <Aviso>{r.mensagem}</Aviso>}
      </div>
    );
  }
  if (!aberto) {
    return (
      <Botao variante="perigo" className="self-start" onClick={() => setAberto(true)}>
        Cancelar cirurgia
      </Botao>
    );
  }
  return (
    <form action={enviar} className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50/50 p-4">
      <p className="text-sm">A cirurgia continua no sistema, marcada como cancelada. Dá para reativar depois.</p>
      <textarea name="motivo" required minLength={3} rows={2} placeholder="Motivo (ex.: paciente remarcou)" className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base" />
      {estado && !estado.ok && <Aviso>{estado.mensagem}</Aviso>}
      <div className="flex gap-2">
        <Botao type="submit" variante="perigo" disabled={enviando}>
          {enviando ? "Cancelando…" : "Confirmar cancelamento"}
        </Botao>
        <Botao type="button" variante="secundario" onClick={() => setAberto(false)}>
          Voltar
        </Botao>
      </div>
    </form>
  );
}
