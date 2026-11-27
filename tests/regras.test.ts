import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { abrirBanco } from "@/db/client";
import { procedimentos, regrasKit } from "@/db/schema";
import { ErroPermissao, type Ator } from "@/lib/catalogo";
import { carregarCatalogoInicial } from "@/lib/catalogo/carga-inicial";
import { criarCirurgia } from "@/lib/cirurgias";
import {
  atualizarRegra,
  carregarRegras,
  carregarRegrasIniciais,
  criarRegra,
  definirAtivoRegra,
  pendenciasPorCirurgia,
  previsaoDaCirurgia,
  preverMateriais,
  REGRAS_INICIAIS,
  type PrevisaoCompleta,
} from "@/lib/regras";
import { calcularPrevisao, type RegraMotor } from "@/lib/regras/motor";
import { URL_TESTE } from "./preparar-banco";

const { db, fechar } = abrirBanco(URL_TESTE);
afterAll(fechar);

const admin: Ator = { id: "u-admin", perfil: "administrador" };
const mariana: Ator = { id: "u-compras", perfil: "compras" };
const eliadna: Ator = { id: "u-hospital", perfil: "hospital" };

let tipos: Map<string, string>;

async function prever(...codigos: string[]): Promise<PrevisaoCompleta> {
  return preverMateriais(db, codigos.map((codigo) => ({ codigo, tipo: tipos.get(codigo)! })));
}

/** { "Nome do produto": quantidade } para comparar fácil. */
function qtd(p: PrevisaoCompleta): Record<string, number> {
  return Object.fromEntries(p.linhas.map((l) => [l.produto, l.quantidade]));
}

const KIT = ["Cânula Klein de infiltração", "Cânula de 9 furos para vibrolipo", "Mangueira de infiltração", "Mangueira de propulsão de duas vias"];
const COLA = "Cola cirúrgica Dermabond High Viscosity";

beforeAll(async () => {
  await carregarCatalogoInicial(db);
  const r = await carregarRegrasIniciais(db);
  expect(r.faltando).toEqual([]);
  tipos = new Map((await db.select().from(procedimentos)).map((p) => [p.codigo, p.tipo]));
});

describe("regras iniciais", () => {
  it("cria todas e não duplica se rodar de novo", async () => {
    expect((await carregarRegras(db)).length).toBe(REGRAS_INICIAIS.length);
    expect((await carregarRegrasIniciais(db)).criadas).toBe(0);
  });
});

describe("testes de aceitação da especificação", () => {
  it("1. Mamoplastia isolada com lipo axilar: cânula azul, sem kit vibrolipo", async () => {
    const q = qtd(await prever("mamoplastia", "lipo_axilar"));
    expect(q["Cânula azul manual reta de 3 furos"]).toBe(1);
    for (const item of KIT) expect(q[item]).toBeUndefined();
    expect(q[COLA]).toBe(3);
    expect(q["Sutiã cirúrgico"]).toBe(2);
  });

  it("2. Mamoplastia + abdominoplastia: 1 kit, nenhuma cânula azul, 5 colas e 2 cintas", async () => {
    const p = await prever("mamoplastia", "abdominoplastia", "lipo_axilar");
    const q = qtd(p);
    for (const item of KIT) expect(q[item]).toBe(1);
    expect(q["Cânula azul manual reta de 3 furos"]).toBeUndefined();
    expect(q[COLA]).toBe(5);
    expect(q["Cinta cirúrgica"]).toBe(2);
    expect(q["Sutiã cirúrgico"]).toBeUndefined();
    expect(p.pendencias).toEqual([]);
  });

  it("3. Lipo com Renuvion: 1 kit vibrolipo e 1 ponteira", async () => {
    const q = qtd(await prever("lipoaspiracao", "renuvion"));
    for (const item of KIT) expect(q[item]).toBe(1);
    expect(q["Ponteira Renuvion"]).toBe(1);
    expect(q[COLA]).toBe(1);
  });
});

describe("regras informadas pelo Edmo", () => {
  it("lipoescultura leva Viaro além do kit; abdominoplastia isolada não", async () => {
    expect(qtd(await prever("abdominoplastia", "lipoescultura_enxerto"))["Cânula Viaro Arms Ugraft reta"]).toBe(1);
    const abdomen = await prever("abdominoplastia");
    expect(qtd(abdomen)["Cânula Viaro Arms Ugraft reta"]).toBeUndefined();
    expect(qtd(abdomen)[COLA]).toBe(2);
    expect(abdomen.linhas.find((l) => l.produto === COLA)?.provisoria).toBe(true);
  });

  it("cola: prótese 1, prótese + abdômen 5, mama + lipo 4, facelift 2, blefaro e rino nenhuma", async () => {
    expect(qtd(await prever("protese_mama"))[COLA]).toBe(1);
    expect(qtd(await prever("protese_mama", "abdominoplastia"))[COLA]).toBe(5);
    expect(qtd(await prever("mamoplastia", "lipoaspiracao"))[COLA]).toBe(4);
    expect(qtd(await prever("facelift_v3"))[COLA]).toBe(2);
    const blefaro = await prever("blefaroplastia");
    expect(qtd(blefaro)[COLA]).toBeUndefined();
    expect(blefaro.pendencias.map((p) => p.grupo)).not.toContain("cola");
  });

  it("toda paciente recebe robe, bolsa e chinelo; facial sem kinesio", async () => {
    const q = qtd(await prever("rinoplastia"));
    expect(q).toMatchObject({ "Robe/avental personalizado": 1, "Bolsa personalizada": 1, Chinelo: 1 });
    expect(q["Fita kinesio"]).toBeUndefined();
  });

  it("meia só com abdominoplastia ou lipo", async () => {
    expect(qtd(await prever("lipoaspiracao"))["Meia de compressão"]).toBe(1);
    expect(qtd(await prever("mamoplastia"))["Meia de compressão"]).toBeUndefined();
  });

  it("combinação sem regra vira pendência, sem quantidade inventada", async () => {
    const p = await prever("mamoplastia_protese", "lipoaspiracao");
    expect(qtd(p)[COLA]).toBeUndefined();
    expect(p.pendencias.map((x) => x.grupo)).toEqual(["cola"]);
    // Facial: peças compressivas ainda não definidas.
    expect((await prever("facelift_v1")).pendencias.map((x) => x.grupo)).toEqual(["compressiva"]);
  });

  it("sutiã e cinta saem sem tamanho; o chinelo usa o tamanho informado", async () => {
    const [v] = await db.execute<{ id: number; nome: string }>(
      (await import("drizzle-orm")).sql`select v.id, v.nome from variantes v join produtos p on p.id = v.produto_id where p.nome = 'Chinelo' order by v.ordem limit 1`,
    );
    const id = await criarCirurgia(db, mariana, {
      paciente: "Paciente Regras Teste",
      data: "2027-01-15",
      procedimentos: ["mamoplastia"],
      chineloVarianteId: Number(v.id),
    });
    const p = await previsaoDaCirurgia(db, eliadna, id);
    expect(p.linhas.find((l) => l.produto === "Sutiã cirúrgico")?.tamanho).toBe("tamanho na confirmação");
    expect(p.linhas.find((l) => l.produto === "Chinelo")?.tamanho).toBe(v.nome);
    expect(p.linhas.find((l) => l.produto === COLA)?.tamanho).toBeNull();
    expect((await pendenciasPorCirurgia(db, [id])).get(id)).toBe(0);
  });
});

describe("motor", () => {
  const r = (id: number, extra: Partial<RegraMotor>): RegraMotor => ({
    id,
    grupo: "cola",
    descricao: `regra ${id}`,
    todos: [],
    algum: [],
    nenhum: [],
    somente: false,
    prioridade: 10,
    provisoria: false,
    ativo: true,
    itens: [{ produtoId: 1, quantidade: id }],
    ...extra,
  });
  const marcados = [{ codigo: "a", tipo: "procedimento" }];

  it("duas regras igualmente fortes e diferentes viram conflito", () => {
    const p = calcularPrevisao(marcados, [r(1, { todos: ["a"] }), r(2, { todos: ["a"] })]);
    expect(p.pendencias).toContainEqual({ grupo: "cola", motivo: "conflito", regras: [1, 2] });
  });

  it("maior prioridade vence; depois a mais específica; inativa não conta", () => {
    expect(calcularPrevisao(marcados, [r(1, { todos: ["a"] }), r(2, { todos: ["a"], prioridade: 20 })]).itens[0].quantidade).toBe(2);
    expect(calcularPrevisao(marcados, [r(1, {}), r(3, { todos: ["a"] })]).itens[0].quantidade).toBe(3);
    expect(calcularPrevisao(marcados, [r(1, {}), r(3, { todos: ["a"], ativo: false })]).itens[0].quantidade).toBe(1);
  });

  it("'somente' ignora complementos e tecnologias", () => {
    const regra = r(5, { todos: ["a"], somente: true });
    expect(calcularPrevisao([...marcados, { codigo: "x", tipo: "tecnologia" }, { codigo: "y", tipo: "complemento" }], [regra]).itens).toHaveLength(1);
    expect(calcularPrevisao([...marcados, { codigo: "b", tipo: "procedimento" }], [regra]).itens).toHaveLength(0);
  });
});

describe("edição de regras", () => {
  it("só o administrador cria, altera e desativa; nada se apaga", async () => {
    const dados = {
      grupo: "cola",
      descricao: "Mamoplastia com prótese isolada: teste",
      todos: ["mamoplastia_protese"],
      somente: true,
      itens: [{ produtoId: (await carregarRegras(db)).find((x) => x.grupo === "cola" && x.itens.length)!.itens[0].produtoId, quantidade: 2 }],
    };
    await expect(criarRegra(db, mariana, dados)).rejects.toThrow(ErroPermissao);
    const id = await criarRegra(db, admin, dados);
    expect(qtd(await prever("mamoplastia_protese"))[COLA]).toBe(2);

    await atualizarRegra(db, admin, id, { ...dados, itens: [{ ...dados.itens[0], quantidade: 3 }] });
    expect(qtd(await prever("mamoplastia_protese"))[COLA]).toBe(3);

    await definirAtivoRegra(db, admin, id, false);
    expect((await prever("mamoplastia_protese")).pendencias.map((p) => p.grupo)).toContain("cola");
    await expect(db.delete(regrasKit).where(eq(regrasKit.id, id))).rejects.toThrow();
  });

  it("recusa grupo inválido, procedimento inexistente e contradição", async () => {
    await expect(criarRegra(db, admin, { grupo: "outro", descricao: "Regra inválida", itens: [] })).rejects.toThrow("grupo");
    await expect(criarRegra(db, admin, { grupo: "cola", descricao: "Regra inválida", todos: ["nao_existe"] })).rejects.toThrow("não existe");
    await expect(criarRegra(db, admin, { grupo: "cola", descricao: "Regra inválida", todos: ["mamoplastia"], nenhum: ["mamoplastia"] })).rejects.toThrow("exigido e proibido");
  });
});
