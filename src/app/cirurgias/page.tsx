import Link from "next/link";
import { Pagina, Selo } from "@/components/pagina";
import { hojeSP, listarCirurgias, NOME_SITUACAO, semanaDe, somarDias } from "@/lib/cirurgias";
import { pode } from "@/lib/permissoes";
import { comAuth, exigirPermissao } from "@/lib/sessao";

const DIA = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "UTC" });
const CURTA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const fmt = (f: Intl.DateTimeFormat, d: string) => f.format(new Date(`${d}T12:00:00Z`));

export default async function Cirurgias({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const usuario = await exigirPermissao("cirurgias:ver");
  const ator = { id: usuario.id, perfil: usuario.perfil };
  const { semana: param } = await searchParams;
  const hoje = hojeSP();
  const base = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : hoje;
  const { inicio, fim } = semanaDe(base);
  const lista = await comAuth((_, db) => listarCirurgias(db, ator, { de: inicio, ate: fim }));
  const dias = [...new Set(lista.map((c) => c.data))];
  const edita = pode(usuario.perfil, "cirurgias:editar");
  const ehEstaSemana = semanaDe(hoje).inicio === inicio;

  return (
    <Pagina
      usuario={usuario}
      titulo="Cirurgias"
      voltar={{ href: "/", rotulo: "Início" }}
      acoes={
        <div className="flex gap-2 text-sm">
          {pode(usuario.perfil, "regras:editar") && (
            <Link href="/cirurgias/procedimentos" className="rounded-lg border border-neutral-300 bg-white px-3 py-2 font-semibold">
              Procedimentos
            </Link>
          )}
          {edita && (
            <Link href={`/cirurgias/nova${ehEstaSemana ? "" : `?data=${inicio}`}`} className="rounded-lg bg-neutral-900 px-3 py-2 font-semibold text-white">
              Nova cirurgia
            </Link>
          )}
        </div>
      }
    >
      <nav className="flex items-center justify-between gap-2 text-sm">
        <Link href={`/cirurgias?semana=${somarDias(inicio, -7)}`} className="rounded-lg border border-neutral-300 bg-white px-3 py-2">
          ← Anterior
        </Link>
        <div className="text-center">
          <p className="font-semibold">
            {fmt(CURTA, inicio)} a {fmt(CURTA, fim)}
          </p>
          {ehEstaSemana ? (
            <p className="text-xs text-neutral-500">Esta semana</p>
          ) : (
            <Link href="/cirurgias" className="text-xs text-neutral-500 underline">
              Voltar para esta semana
            </Link>
          )}
        </div>
        <Link href={`/cirurgias?semana=${somarDias(inicio, 7)}`} className="rounded-lg border border-neutral-300 bg-white px-3 py-2">
          Próxima →
        </Link>
      </nav>

      {lista.length === 0 && <p className="text-sm text-neutral-500">Nenhuma cirurgia nesta semana.</p>}
      {dias.map((d) => (
        <section key={d} className="flex flex-col gap-2">
          <h2 className={`text-sm font-semibold first-letter:uppercase ${d === hoje ? "text-neutral-900" : "text-neutral-600"}`}>
            {fmt(DIA, d)} {d === hoje && <Selo cor="azul">Hoje</Selo>}
          </h2>
          <ul className="flex flex-col gap-2">
            {lista
              .filter((c) => c.data === d)
              .map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/cirurgias/${c.id}`}
                    className={`flex flex-col gap-1 rounded-xl border bg-white p-4 hover:border-neutral-900 ${c.situacao === "cancelada" ? "border-dashed border-neutral-300 opacity-60" : "border-neutral-200"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`font-semibold ${c.situacao === "cancelada" ? "line-through" : ""}`}>
                        {c.hora && <span className="mr-2 tabular-nums text-neutral-500">{c.hora}</span>}
                        {c.paciente}
                      </span>
                      {c.situacao !== "agendada" && (
                        <Selo cor={c.situacao === "cancelada" ? "vermelho" : "verde"}>{NOME_SITUACAO[c.situacao]}</Selo>
                      )}
                    </div>
                    <span className="text-sm text-neutral-600">{c.procedimentos.map((p) => p.nome).join(" + ")}</span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </Pagina>
  );
}
