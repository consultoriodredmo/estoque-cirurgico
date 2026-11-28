"use client";
import { useActionState, useState } from "react";
import { Aviso, Botao } from "@/components/ui";
import type { Resultado } from "@/lib/acao";
import { acaoDesfazerConsumo } from "./consumo/acoes";

export function DesfazerConsumo({ cirurgiaId }: { cirurgiaId: number }) {
  const [aberto, setAberto] = useState(false);
  const [id] = useState(() => crypto.randomUUID());
  const [estado, enviar, enviando] = useActionState<Resultado | null, FormData>(acaoDesfazerConsumo.bind(null, cirurgiaId), null);
  if (!aberto) {
    return (
      <Botao variante="perigo" className="self-start px-3 py-1.5" onClick={() => setAberto(true)}>
        Desfazer confirmação
      </Botao>
    );
  }
  return (
    <form action={enviar} className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm">O consumo é estornado (fica registrado no histórico), o estoque volta e a cirurgia pode ser confirmada de novo.</p>
      <textarea name="motivo" required minLength={5} rows={2} placeholder="Motivo (ex.: tamanho da cinta errado)" className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base" />
      {estado && <Aviso tipo={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Aviso>}
      <div className="flex gap-2">
        <Botao type="submit" variante="perigo" disabled={enviando || estado?.ok}>
          {enviando ? "Desfazendo…" : "Confirmar"}
        </Botao>
        <Botao type="button" variante="secundario" onClick={() => setAberto(false)}>
          Voltar
        </Botao>
      </div>
    </form>
  );
}
