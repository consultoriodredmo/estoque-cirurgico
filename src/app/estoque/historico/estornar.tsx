"use client";
import { useActionState, useState } from "react";
import { Aviso, Botao } from "@/components/ui";
import type { Resultado } from "@/lib/acao";
import { acaoEstornar } from "../acoes";

export function BotaoEstornar({ lancamentoId }: { lancamentoId: string }) {
  const [aberto, setAberto] = useState(false);
  const [id] = useState(() => crypto.randomUUID());
  const [estado, enviar, enviando] = useActionState<Resultado | null, FormData>(acaoEstornar.bind(null, lancamentoId), null);

  if (!aberto) {
    return (
      <Botao variante="perigo" className="mt-3 px-3 py-1" onClick={() => setAberto(true)}>
        Estornar
      </Botao>
    );
  }
  return (
    <form action={enviar} className="mt-3 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm">O estorno cria um lançamento com as quantidades invertidas. O original continua no histórico.</p>
      <textarea name="motivo" required minLength={5} rows={2} placeholder="Motivo do estorno" className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base" />
      {estado && <Aviso tipo={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Aviso>}
      <div className="flex gap-2">
        <Botao type="submit" variante="perigo" disabled={enviando || estado?.ok}>
          {enviando ? "Estornando…" : "Confirmar estorno"}
        </Botao>
        <Botao type="button" variante="secundario" onClick={() => setAberto(false)}>
          Cancelar
        </Botao>
      </div>
    </form>
  );
}
