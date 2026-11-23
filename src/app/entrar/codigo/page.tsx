"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Aviso, Botao, Campo, TelaCentral } from "@/components/ui";
import { authCliente, mensagemErro } from "@/lib/auth-cliente";

export default function Codigo() {
  const router = useRouter();
  const [recuperacao, setRecuperacao] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(form: FormData) {
    setEnviando(true);
    setErro("");
    const codigo = String(form.get("codigo") ?? "").replace(/\s/g, "");
    const { error } = recuperacao
      ? await authCliente.twoFactor.verifyBackupCode({ code: codigo })
      : await authCliente.twoFactor.verifyTotp({ code: codigo });
    if (error) {
      setErro(mensagemErro(error));
      setEnviando(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <TelaCentral titulo="Código de verificação">
      <form action={enviar} className="flex flex-col gap-4">
        <p className="text-sm text-neutral-600">
          {recuperacao
            ? "Digite um dos códigos de recuperação que você guardou. Cada um só funciona uma vez."
            : "Abra o aplicativo autenticador no celular e digite o código de 6 números de “Estoque Cirúrgico”."}
        </p>
        <Campo
          key={recuperacao ? "rec" : "totp"}
          rotulo={recuperacao ? "Código de recuperação" : "Código"}
          name="codigo"
          inputMode={recuperacao ? "text" : "numeric"}
          autoComplete="one-time-code"
          pattern={recuperacao ? undefined : "[0-9 ]{6,7}"}
          maxLength={recuperacao ? 20 : 7}
          required
          autoFocus
        />
        <Aviso>{erro}</Aviso>
        <Botao type="submit" disabled={enviando}>
          {enviando ? "Conferindo…" : "Confirmar"}
        </Botao>
        <button
          type="button"
          onClick={() => {
            setRecuperacao(!recuperacao);
            setErro("");
          }}
          className="text-left text-sm text-neutral-600 underline"
        >
          {recuperacao ? "Usar o código do aplicativo" : "Perdi o celular: usar código de recuperação"}
        </button>
        <Link href="/entrar" className="text-sm text-neutral-500 underline">
          Voltar
        </Link>
      </form>
    </TelaCentral>
  );
}
