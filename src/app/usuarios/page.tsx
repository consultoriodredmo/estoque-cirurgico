import { Cabecalho } from "@/components/cabecalho";
import { listarUsuarios } from "@/lib/gestao-usuarios";
import { comAuth, exigirPermissao } from "@/lib/sessao";
import { FormularioNovo, LinhaAcoes } from "./componentes";
import { NOME_PERFIL, ehPerfil } from "@/lib/permissoes";

export default async function Usuarios() {
  const admin = await exigirPermissao("usuarios:gerir");
  const usuarios = await comAuth((_, db) => listarUsuarios(db));

  return (
    <>
      <Cabecalho nome={admin.nome} perfil={admin.perfil} />
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-8">
        <h1 className="text-xl font-semibold">Usuários</h1>

        <section className="flex flex-col gap-3">
          {usuarios.map((u) => (
            <article key={u.id} className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {u.nome} {u.id === admin.id && <span className="text-xs font-normal text-neutral-500">(você)</span>}
                  </p>
                  <p className="text-sm text-neutral-600">{u.email}</p>
                </div>
                <div className="flex flex-wrap gap-1 text-xs">
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5">
                    {ehPerfil(u.perfil) ? NOME_PERFIL[u.perfil] : "Sem perfil"}
                  </span>
                  {!u.ativo && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800">Desativado</span>}
                  {u.ativo && u.primeiroAcessoPendente && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">Primeiro acesso pendente</span>
                  )}
                </div>
              </div>
              {u.id !== admin.id && <LinhaAcoes usuario={u} />}
            </article>
          ))}
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="font-semibold">Novo usuário</h2>
          <FormularioNovo />
        </section>
      </main>
    </>
  );
}
