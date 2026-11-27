import { Pagina } from "@/components/pagina";
import { listarProcedimentos, tamanhosDeChinelo } from "@/lib/cirurgias";
import { comAuth, exigirPermissao } from "@/lib/sessao";
import { FormularioCirurgia } from "../formulario";

export default async function NovaCirurgia({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const usuario = await exigirPermissao("cirurgias:editar");
  const { data } = await searchParams;
  const [procedimentos, chinelos] = await comAuth((_, db) => Promise.all([listarProcedimentos(db), tamanhosDeChinelo(db)]));
  return (
    <Pagina usuario={usuario} titulo="Nova cirurgia" voltar={{ href: "/cirurgias", rotulo: "Cirurgias" }}>
      <FormularioCirurgia opcoes={{ procedimentos, chinelos }} dataInicial={data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : undefined} />
    </Pagina>
  );
}
