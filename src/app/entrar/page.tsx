import { redirect } from "next/navigation";
import { TelaCentral } from "@/components/ui";
import { obterUsuarioAtual } from "@/lib/sessao";
import { FormularioEntrar } from "./formulario";

export default async function Entrar({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  if (await obterUsuarioAtual()) redirect("/");
  const { erro } = await searchParams;
  const aviso =
    erro === "perfil"
      ? "Seu usuário está sem perfil definido. Fale com o administrador."
      : erro === "sessao"
        ? "Sua sessão terminou neste navegador. Entre de novo com o seu e-mail e a senha que você criou; você continua de onde parou."
        : undefined;
  return (
    <TelaCentral titulo="Entrar">
      <FormularioEntrar avisoInicial={aviso} />
    </TelaCentral>
  );
}
