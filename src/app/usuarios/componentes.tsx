"use client";
import { useActionState, useState, useTransition } from "react";
import { Aviso, Botao, Campo } from "@/components/ui";
import type { LinhaUsuario } from "@/lib/gestao-usuarios";
import { NOME_PERFIL, PERFIS } from "@/lib/permissoes";
import { acaoAtivo, acaoCriar, acaoPerfil, acaoRedefinir, type Resultado } from "./acoes";

function SenhaTemporaria({ senha, email }: { senha: string; email?: string }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-semibold">Senha temporária{email ? ` de ${email}` : ""}:</p>
      <code className="mt-1 block select-all rounded bg-white px-2 py-1 font-mono text-base">{senha}</code>
      <p className="mt-2 text-xs">
        Passe para a pessoa pessoalmente ou por telefone. Ela vai trocar a senha e configurar o código no primeiro
        acesso. Esta senha não aparece de novo.
      </p>
    </div>
  );
}

export function FormularioNovo() {
  const [estado, enviar, enviando] = useActionState<Resultado | null, FormData>(acaoCriar, null);
  return (
    <form action={enviar} className="flex flex-col gap-3">
      <Campo rotulo="Nome completo" name="nome" required minLength={3} />
      <Campo rotulo="E-mail" name="email" type="email" required />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Perfil</span>
        <select name="perfil" required defaultValue="" className="rounded-lg border border-neutral-300 px-3 py-2.5 text-base">
          <option value="" disabled>
            Escolha…
          </option>
          {PERFIS.map((p) => (
            <option key={p} value={p}>
              {NOME_PERFIL[p]}
            </option>
          ))}
        </select>
      </label>
      {estado && !estado.ok && <Aviso>{estado.mensagem}</Aviso>}
      {estado?.senhaTemporaria && <SenhaTemporaria senha={estado.senhaTemporaria} email={estado.email} />}
      <Botao type="submit" disabled={enviando} className="self-start">
        {enviando ? "Criando…" : "Criar usuário"}
      </Botao>
    </form>
  );
}

export function LinhaAcoes({ usuario }: { usuario: LinhaUsuario }) {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [pendente, iniciar] = useTransition();

  const rodar = (fn: () => Promise<Resultado>, confirmacao?: string) => {
    if (confirmacao && !window.confirm(confirmacao)) return;
    iniciar(async () => setResultado(await fn()));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Perfil"
          defaultValue={usuario.perfil ?? ""}
          disabled={pendente}
          onChange={(e) =>
            rodar(() => acaoPerfil(usuario.id, e.target.value), `Mudar o perfil de ${usuario.nome}?`)
          }
          className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
        >
          {PERFIS.map((p) => (
            <option key={p} value={p}>
              {NOME_PERFIL[p]}
            </option>
          ))}
        </select>
        <Botao
          variante="secundario"
          className="px-3 py-1.5"
          disabled={pendente}
          onClick={() =>
            rodar(
              () => acaoRedefinir(usuario.id),
              `Redefinir o acesso de ${usuario.nome}? A senha atual e o código do celular deixam de valer.`,
            )
          }
        >
          Redefinir acesso
        </Botao>
        <Botao
          variante={usuario.ativo ? "perigo" : "secundario"}
          className="px-3 py-1.5"
          disabled={pendente}
          onClick={() =>
            rodar(
              () => acaoAtivo(usuario.id, !usuario.ativo),
              usuario.ativo ? `Desativar ${usuario.nome}? O acesso é cortado na hora.` : undefined,
            )
          }
        >
          {usuario.ativo ? "Desativar" : "Reativar"}
        </Botao>
      </div>
      {resultado && <Aviso tipo={resultado.ok ? "ok" : "erro"}>{resultado.mensagem}</Aviso>}
      {resultado?.senhaTemporaria && <SenhaTemporaria senha={resultado.senhaTemporaria} />}
    </div>
  );
}
