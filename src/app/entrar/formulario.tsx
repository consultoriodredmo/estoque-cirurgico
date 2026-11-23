"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Aviso, Botao, Campo } from "@/components/ui";
import { authCliente, mensagemErro } from "@/lib/auth-cliente";

export function FormularioEntrar({ avisoInicial }: { avisoInicial?: string }) {
  const router = useRouter();
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(form: FormData) {
    setEnviando(true);
    setErro("");
    const { data, error } = await authCliente.signIn.email({
      email: String(form.get("email") ?? "").trim().toLowerCase(),
      password: String(form.get("senha") ?? ""),
    });
    if (error) {
      setErro(mensagemErro(error));
      setEnviando(false);
      return;
    }
    // Com o código já configurado, o próximo passo é digitá-lo.
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      router.push("/entrar/codigo");
    } else {
      router.push("/primeiro-acesso");
    }
    router.refresh();
  }

  return (
    <form action={enviar} className="flex flex-col gap-4">
      <Aviso tipo="info">{avisoInicial}</Aviso>
      <Campo rotulo="E-mail" name="email" type="email" autoComplete="username" required autoFocus />
      <Campo rotulo="Senha" name="senha" type="password" autoComplete="current-password" required />
      <Aviso>{erro}</Aviso>
      <Botao type="submit" disabled={enviando}>
        {enviando ? "Entrando…" : "Entrar"}
      </Botao>
      <p className="text-xs text-neutral-500">Esqueceu a senha? Peça ao administrador para redefinir o acesso.</p>
    </form>
  );
}
