import { Campo } from "@/components/ui";
import type { OpcaoEsteril } from "@/lib/catalogo";

export type ValoresProduto = {
  nome?: string;
  categoria?: string | null;
  fabricante?: string | null;
  referencia?: string | null;
  unidade?: string;
  esteril?: OpcaoEsteril;
  localPadrao?: string | null;
  observacao?: string | null;
};

const classeSelect = "rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base";

/** Campos do produto, usados no cadastro e na edição. */
export function CamposProduto({ v = {}, desabilitado = false }: { v?: ValoresProduto; desabilitado?: boolean }) {
  return (
    <fieldset disabled={desabilitado} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Campo rotulo="Nome" name="nome" defaultValue={v.nome} required minLength={3} />
      </div>
      <Campo rotulo="Categoria" name="categoria" defaultValue={v.categoria ?? ""} list="categorias" dica="Ex.: Cânula, Mangueira, Peça compressiva" />
      <datalist id="categorias">
        {["Cânula", "Mangueira", "Ponteira", "Cola", "Peça compressiva", "Fita", "Acolhimento"].map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <Campo rotulo="Fabricante" name="fabricante" defaultValue={v.fabricante ?? ""} />
      <Campo rotulo="Referência do fabricante" name="referencia" defaultValue={v.referencia ?? ""} />
      <Campo rotulo="Unidade de estoque" name="unidade" defaultValue={v.unidade ?? "unidade"} required dica="unidade, par, rolo, aplicador…" />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-neutral-800">Estéril?</span>
        <select name="esteril" defaultValue={v.esteril ?? "a_definir"} className={classeSelect}>
          <option value="sim">Sim</option>
          <option value="nao">Não</option>
          <option value="a_definir">A definir</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-neutral-800">Local padrão no hospital</span>
        <select name="localPadrao" defaultValue={v.localPadrao ?? ""} className={classeSelect}>
          <option value="">A definir</option>
          <option value="farmacia">Farmácia do hospital</option>
          <option value="armario">Armário privativo</option>
          <option value="consultorio">Consultório</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="font-medium text-neutral-800">Observação</span>
        <textarea
          name="observacao"
          defaultValue={v.observacao ?? ""}
          rows={2}
          maxLength={1000}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-base"
        />
      </label>
    </fieldset>
  );
}
