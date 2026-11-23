"use client";
import { useRouter } from "next/navigation";
import { authCliente } from "@/lib/auth-cliente";
import { Botao } from "./ui";

export function BotaoSair() {
  const router = useRouter();
  return (
    <Botao
      variante="secundario"
      className="px-3 py-1.5"
      onClick={async () => {
        await authCliente.signOut();
        router.push("/entrar");
        router.refresh();
      }}
    >
      Sair
    </Botao>
  );
}
