"use client";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useState } from "react";
import { Aviso, Botao, Campo } from "@/components/ui";
import { authCliente, mensagemErro, sessaoPerdida } from "@/lib/auth-cliente";

export function EtapaSenha({ nome }: { nome: string }) {
  const router = useRouter();
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(form: FormData) {
    setErro("");
    const atual = String(form.get("atual") ?? "");
    const nova = String(form.get("nova") ?? "");
    if (nova !== String(form.get("confirmar") ?? "")) return setErro("A confirmação não é igual à senha nova.");
    if (nova === atual) return setErro("A senha nova precisa ser diferente da temporária.");
    setEnviando(true);
    const { error } = await authCliente.changePassword({
      currentPassword: atual,
      newPassword: nova,
      revokeOtherSessions: true,
    });
    if (error) {
      if (sessaoPerdida(error)) return router.push("/entrar?erro=sessao");
      setErro(mensagemErro(error));
      setEnviando(false);
      return;
    }
    router.refresh();
  }

  return (
    <form action={enviar} className="flex flex-col gap-4">
      <p className="text-sm text-neutral-600">
        Olá, {nome}. Troque a senha temporária por uma só sua, com pelo menos 10 caracteres.
      </p>
      <Campo rotulo="Senha temporária" name="atual" type="password" autoComplete="current-password" required />
      <Campo rotulo="Senha nova" name="nova" type="password" autoComplete="new-password" minLength={10} required />
      <Campo rotulo="Confirme a senha nova" name="confirmar" type="password" autoComplete="new-password" required />
      <Aviso>{erro}</Aviso>
      <Botao type="submit" disabled={enviando}>
        {enviando ? "Salvando…" : "Salvar senha"}
      </Botao>
    </form>
  );
}

type Preparo = { qr: string; segredo: string; recuperacao: string[] };

export function EtapaCodigo() {
  const router = useRouter();
  const [preparo, setPreparo] = useState<Preparo | null>(null);
  const [guardou, setGuardou] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function gerar(form: FormData) {
    setErro("");
    setEnviando(true);
    const { data, error } = await authCliente.twoFactor.enable({ password: String(form.get("senha") ?? "") });
    setEnviando(false);
    if (sessaoPerdida(error)) return router.push("/entrar?erro=sessao");
    if (error || !data || data.method !== "totp") return setErro(mensagemErro(error));
    const segredo = new URL(data.totpURI).searchParams.get("secret") ?? "";
    setPreparo({ qr: await QRCode.toDataURL(data.totpURI, { margin: 1, width: 220 }), segredo, recuperacao: data.backupCodes });
  }

  async function confirmar(form: FormData) {
    setErro("");
    setEnviando(true);
    const { error } = await authCliente.twoFactor.verifyTotp({
      code: String(form.get("codigo") ?? "").replace(/\s/g, ""),
    });
    if (error) {
      if (sessaoPerdida(error)) return router.push("/entrar?erro=sessao");
      setErro(mensagemErro(error));
      setEnviando(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  if (!preparo) {
    return (
      <form action={gerar} className="flex flex-col gap-4">
        <p className="text-sm text-neutral-600">
          A cada login, além da senha, o sistema pede um código que muda a cada 30 segundos. Instale no celular o
          <strong> Google Authenticator</strong> ou o <strong>Microsoft Authenticator</strong> e confirme sua senha para
          continuar.
        </p>
        <Campo rotulo="Sua senha" name="senha" type="password" autoComplete="current-password" required />
        <Aviso>{erro}</Aviso>
        <Botao type="submit" disabled={enviando}>
          {enviando ? "Gerando…" : "Continuar"}
        </Botao>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm text-neutral-600">No aplicativo, toque em “+” e leia este QR code:</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- imagem gerada na hora, sem servidor */}
        <img src={preparo.qr} alt="QR code para o aplicativo autenticador" width={220} height={220} />
        <details className="text-xs text-neutral-500">
          <summary>Não consegue ler? Digite a chave</summary>
          <code className="mt-1 block break-all rounded bg-neutral-100 p-2">{preparo.segredo}</code>
        </details>
      </div>

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
        <p className="text-sm font-semibold text-amber-950">Códigos de recuperação</p>
        <p className="mt-1 text-xs text-amber-900">
          Se perder o celular, cada código abaixo permite entrar uma vez. Anote ou fotografe e guarde fora do celular.
          Eles não aparecerão de novo.
        </p>
        <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm">
          {preparo.recuperacao.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <label className="mt-3 flex items-center gap-2 text-sm text-amber-950">
          <input type="checkbox" checked={guardou} onChange={(e) => setGuardou(e.target.checked)} />
          Guardei os códigos de recuperação
        </label>
      </div>

      <form action={confirmar} className="flex flex-col gap-4">
        <Campo
          rotulo="Código que aparece no aplicativo"
          name="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
        />
        <Aviso>{erro}</Aviso>
        <Botao type="submit" disabled={enviando || !guardou}>
          {enviando ? "Conferindo…" : "Ativar e entrar"}
        </Botao>
      </form>
    </div>
  );
}
