import Link from "next/link";
import { NOME_PERFIL, type Perfil } from "@/lib/permissoes";
import { BotaoSair } from "./botao-sair";

export function Cabecalho({ nome, perfil }: { nome: string; perfil: Perfil }) {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-3">
        <Link href="/" className="font-semibold">
          Estoque Cirúrgico
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-right leading-tight sm:block">
            {nome}
            <span className="block text-xs text-neutral-500">{NOME_PERFIL[perfil]}</span>
          </span>
          <BotaoSair />
        </div>
      </div>
    </header>
  );
}
