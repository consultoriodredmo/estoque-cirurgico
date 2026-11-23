import { redirect } from "next/navigation";
import { TelaCentral } from "@/components/ui";
import { obterUsuarioAtual } from "@/lib/sessao";
import { FormularioEntrar } from "./formulario";

export default async function Entrar({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  if (await obterUsuarioAtual()) redirect("/");
  const { erro } = await searchParams;
  const aviso = erro === "perfil" ? "Seu usuário está sem perfil definido. Fale com o administrador." : undefined;
  return (
    <TelaCentral titulo="Entrar">
      <FormularioEntrar avisoInicial={aviso} />
    </TelaCentral>
  );
}
