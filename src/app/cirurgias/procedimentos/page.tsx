import { Pagina, Selo } from "@/components/pagina";
import { listarProcedimentos } from "@/lib/cirurgias";
import { comAuth, exigirPermissao } from "@/lib/sessao";
import { AlternarProcedimento, NovoProcedimento } from "./componentes";

export default async function Procedimentos() {
  const usuario = await exigirPermissao("regras:editar");
  const lista = await comAuth((_, db) => listarProcedimentos(db, true));
  return (
    <Pagina usuario={usuario} titulo="Procedimentos e tecnologias" voltar={{ href: "/cirurgias", rotulo: "Cirurgias" }}>
      <p className="text-sm text-neutral-600">
        São as opções marcadas em cada cirurgia; as regras de kit (etapa 2.2) partem delas. Um procedimento não se apaga, só se desativa.
      </p>
      <ul className="flex flex-col gap-2">
        {lista.map((p) => (
          <li key={p.codigo} className={`flex items-center justify-between gap-2 rounded-xl border bg-white p-3 text-sm ${p.ativo ? "border-neutral-200" : "border-dashed border-neutral-300 opacity-60"}`}>
            <span className="flex items-center gap-2">
              {p.nome}
              {p.tipo === "tecnologia" && <Selo cor="azul">Tecnologia</Selo>}
              {!p.ativo && <Selo cor="vermelho">Desativado</Selo>}
            </span>
            <AlternarProcedimento codigo={p.codigo} ativo={p.ativo} />
          </li>
        ))}
      </ul>
      <NovoProcedimento />
    </Pagina>
  );
}
