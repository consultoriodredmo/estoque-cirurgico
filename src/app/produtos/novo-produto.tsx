"use client";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { Aviso, Botao, Campo } from "@/components/ui";
import type { Resultado } from "@/lib/acao";
import { acaoCriarProduto } from "./acoes";
import { CamposProduto } from "./campos-produto";

export function NovoProduto() {
  const router = useRouter();
  const [estado, enviar, enviando] = useActionState<Resultado | null, FormData>(acaoCriarProduto, null);

  useEffect(() => {
    if (estado?.ok && estado.id) router.push(`/produtos/${estado.id}`);
  }, [estado, router]);

  return (
    <details className="rounded-xl border border-neutral-200 bg-white p-5">
      <summary className="cursor-pointer font-semibold">Novo produto</summary>
      <form action={enviar} className="mt-4 flex flex-col gap-4">
        <CamposProduto />
        <Campo
          rotulo="Tamanhos (opcional)"
          name="tamanhos"
          placeholder="PP, P, M, G, GG"
          dica="Separe por vírgula. Sem tamanhos, o produto fica como “Único”."
        />
        {estado && !estado.ok && <Aviso>{estado.mensagem}</Aviso>}
        <Botao type="submit" disabled={enviando} className="self-start">
          {enviando ? "Salvando…" : "Cadastrar produto"}
        </Botao>
      </form>
    </details>
  );
}
