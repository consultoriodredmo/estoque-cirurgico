import { redirect } from "next/navigation";
import { TelaCentral } from "@/components/ui";
import { obterUsuarioAtual } from "@/lib/sessao";
import { EtapaCodigo, EtapaSenha } from "./etapas";

export default async function PrimeiroAcesso() {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/entrar");
  if (!usuario.deveTrocarSenha && usuario.verificacaoAtiva) redirect("/");

  return (
    <TelaCentral titulo="Primeiro acesso">
      <ol className="flex gap-2 text-xs font-medium">
        <li className={`rounded-full px-3 py-1 ${usuario.deveTrocarSenha ? "bg-neutral-900 text-white" : "bg-green-100 text-green-800"}`}>
          1. Senha
        </li>
        <li className={`rounded-full px-3 py-1 ${usuario.deveTrocarSenha ? "bg-neutral-100 text-neutral-500" : "bg-neutral-900 text-white"}`}>
          2. Código no celular
        </li>
      </ol>
      {usuario.deveTrocarSenha ? <EtapaSenha nome={usuario.nome} /> : <EtapaCodigo />}
    </TelaCentral>
  );
}
