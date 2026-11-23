import { eq } from "drizzle-orm";
import { registrarAuditoria } from "@/db/auditoria";
import type { Db } from "@/db/client";
import { produtos, variantes } from "@/db/schema";

/**
 * Materiais iniciais: especificação (seção 4) + etiquetas fotografadas e
 * respostas do Edmo em 22–23/11/2026 (documento "materiais-etiquetas" do
 * projeto). Sem preços nem fornecedores: a Mariana cadastra.
 */
type Item = {
  nome: string;
  categoria: string;
  fabricante: string | null;
  referencia: string | null;
  unidade: string;
  esteril: boolean | null;
  localPadrao: "farmacia" | "armario";
  observacao: string | null;
  tamanhos: { nome: string; codigoBarras?: string }[];
};

const GRADE_BIOBELA = (m: string) => [
  { nome: "PP" },
  { nome: "P" },
  { nome: "M", codigoBarras: m },
  { nome: "G" },
  { nome: "GG" },
];

export const CATALOGO_INICIAL: Item[] = [
  {
    nome: "Cânula Klein de infiltração",
    categoria: "Cânula",
    fabricante: "TAB Instrumentos Cirúrgicos",
    referencia: "25X25 FK",
    unidade: "unidade",
    esteril: true,
    localPadrao: "farmacia",
    observacao: "2,5 mm × 25 cm, furação Klein, cabo laranja. Uso único. Kit vibrolipo.",
    tamanhos: [{ nome: "Único" }],
  },
  {
    nome: "Cânula azul manual reta de 3 furos",
    categoria: "Cânula",
    fabricante: "TAB Instrumentos Cirúrgicos",
    referencia: "4X30 F3",
    unidade: "unidade",
    esteril: true,
    localPadrao: "farmacia",
    observacao: "4 mm × 30 cm, 3 furos, cabo azul. Uso único. Mama isolada com lipo axilar.",
    tamanhos: [{ nome: "Único" }],
  },
  {
    nome: "Cânula de 9 furos para vibrolipo",
    categoria: "Cânula",
    fabricante: "FAGA Medical",
    referencia: "CDJR",
    unidade: "unidade",
    esteril: true,
    localPadrao: "farmacia",
    observacao: "9 furos redondos, 4,0 × 300 mm. Uso único. Kit vibrolipo.",
    tamanhos: [{ nome: "Único", codigoBarras: "7898512006770" }],
  },
  {
    nome: "Cânula Viaro Arms Ugraft reta",
    categoria: "Cânula",
    fabricante: "FAGA Medical",
    referencia: "PAC-CDJS1353021",
    unidade: "unidade",
    esteril: true,
    localPadrao: "farmacia",
    observacao: "3,0 × 210 mm. Uso único. Lipoescultura com enxerto (além do kit vibrolipo).",
    tamanhos: [{ nome: "Único", codigoBarras: "7898511987438" }],
  },
  {
    nome: "Mangueira de infiltração",
    categoria: "Mangueira",
    fabricante: "Fortecare",
    referencia: "TE090603",
    unidade: "unidade",
    esteril: true,
    localPadrao: "farmacia",
    observacao: "Uso único. Kit vibrolipo. Referência lida de impressão apagada: confirmar pela nota fiscal.",
    tamanhos: [{ nome: "Único" }],
  },
  {
    nome: "Mangueira de propulsão de duas vias",
    categoria: "Mangueira",
    fabricante: null,
    referencia: null,
    unidade: "unidade",
    esteril: true,
    localPadrao: "farmacia",
    observacao:
      "Kit vibrolipo. A CONFIRMAR: se é a \"extensão dupla\" esterilizada pelo hospital e se é descartável ou reesterilizada.",
    tamanhos: [{ nome: "Único" }],
  },
  {
    nome: "Ponteira Renuvion",
    categoria: "Ponteira",
    fabricante: "Apyx Medical (importação HPF Aesthetics)",
    referencia: "APYX-27-TP",
    unidade: "unidade",
    esteril: true,
    localPadrao: "farmacia",
    observacao: "Renuvion APR Handpiece 27 cm, Twin Port. Uso único. Quando a cirurgia usa Renuvion.",
    tamanhos: [{ nome: "Único" }],
  },
  {
    nome: "Cola cirúrgica Dermabond High Viscosity",
    categoria: "Cola",
    fabricante: "Ethicon (J&J Medical Brasil)",
    referencia: "AHV12",
    unidade: "aplicador",
    esteril: true,
    localPadrao: "farmacia",
    observacao: "Caixa com 12 aplicadores de ≈0,5 ml; estoque e consumo por aplicador. Guardar até 30 °C.",
    tamanhos: [{ nome: "Único" }],
  },
  {
    nome: "Sutiã cirúrgico",
    categoria: "Peça compressiva",
    fabricante: "Biobela",
    referencia: "16354",
    unidade: "unidade",
    esteril: false,
    localPadrao: "armario",
    observacao: "Castanho. Na nota fiscal aparece como \"cinta\". Grade Biobela: PP 40, P 42, M 44, G 46, GG 48.",
    tamanhos: GRADE_BIOBELA("7908305835507"),
  },
  {
    nome: "Cinta cirúrgica",
    categoria: "Peça compressiva",
    fabricante: "Biobela",
    referencia: "16301",
    unidade: "unidade",
    esteril: false,
    localPadrao: "armario",
    observacao: "Cinta cirúrgica curta com alça, castanho (\"cinta completa\" da especificação). Grade: PP 40 a GG 48.",
    tamanhos: GRADE_BIOBELA("7908305811280"),
  },
  {
    nome: "Meia de compressão",
    categoria: "Peça compressiva",
    fabricante: "Venosan",
    referencia: "SG57000",
    unidade: "par",
    esteril: false,
    localPadrao: "armario",
    observacao: "AES AD 18 mmHg, pé aberto, branca. 1 par por caixa.",
    tamanhos: [{ nome: "P", codigoBarras: "7898360913411" }, { nome: "M" }],
  },
  {
    nome: "Fita kinesio",
    categoria: "Fita",
    fabricante: "aKTive",
    referencia: null,
    unidade: "rolo",
    esteril: false,
    localPadrao: "armario",
    observacao: "Sport Tape kinesiology 5 cm × 5 m. Um rolo atende 2 a 3 pacientes; baixa ao abrir rolo novo.",
    tamanhos: [{ nome: "Único" }],
  },
  {
    nome: "Chinelo",
    categoria: "Acolhimento",
    fabricante: "Produtos Artevale",
    referencia: "CJ-01",
    unidade: "par",
    esteril: false,
    localPadrao: "armario",
    observacao: "Chinelo Junco preto com bordado da clínica. Etiqueta fotografada: código de barras 7896800500016 (numeração não informada).",
    tamanhos: [{ nome: "33/34" }, { nome: "35/36" }, { nome: "37/38" }, { nome: "39/40" }, { nome: "41/42" }],
  },
  {
    nome: "Robe/avental personalizado",
    categoria: "Acolhimento",
    fabricante: null,
    referencia: null,
    unidade: "unidade",
    esteril: false,
    localPadrao: "armario",
    observacao: null,
    tamanhos: [{ nome: "Único" }],
  },
  {
    nome: "Bolsa personalizada",
    categoria: "Acolhimento",
    fabricante: null,
    referencia: null,
    unidade: "unidade",
    esteril: false,
    localPadrao: "armario",
    observacao: null,
    tamanhos: [{ nome: "Único" }],
  },
];

/** Cadastra o que ainda não existe (pelo nome). Pode rodar mais de uma vez. */
export async function carregarCatalogoInicial(db: Db): Promise<{ criados: string[]; existentes: string[] }> {
  const criados: string[] = [];
  const existentes: string[] = [];
  await db.transaction(async (tx) => {
    for (const item of CATALOGO_INICIAL) {
      const [ja] = await tx.select({ id: produtos.id }).from(produtos).where(eq(produtos.nome, item.nome));
      if (ja) {
        existentes.push(item.nome);
        continue;
      }
      const n = criados.length + existentes.length + 1;
      const codigo = `MAT-${String(n).padStart(4, "0")}`;
      const { tamanhos, ...campos } = item;
      const [p] = await tx
        .insert(produtos)
        .values({ ...campos, codigo })
        .onConflictDoNothing()
        .returning({ id: produtos.id });
      if (!p) throw new Error(`Código ${codigo} já usado; rode a carga num catálogo vazio ou cadastre pela tela.`);
      await tx
        .insert(variantes)
        .values(tamanhos.map((t, ordem) => ({ produtoId: p.id, nome: t.nome, codigoBarras: t.codigoBarras ?? null, ordem })));
      await registrarAuditoria(tx, {
        acao: "produto_criado",
        entidade: "produto",
        entidadeId: String(p.id),
        detalhes: { codigo, nome: item.nome, origem: "carga inicial" },
      });
      criados.push(item.nome);
    }
  });
  return { criados, existentes };
}
