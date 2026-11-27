import { desc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { abrirBanco } from "@/db/client";
import { auditoria, cirurgias, procedimentos } from "@/db/schema";
import { ErroPermissao, type Ator } from "@/lib/catalogo";
import { carregarCatalogoInicial } from "@/lib/catalogo/carga-inicial";
import {
  atualizarCirurgia,
  cancelarCirurgia,
  criarCirurgia,
  criarProcedimento,
  definirAtivoProcedimento,
  hojeSP,
  listarCirurgias,
  listarProcedimentos,
  obterCirurgia,
  reativarCirurgia,
  semanaDe,
  tamanhosDeChinelo,
} from "@/lib/cirurgias";
import { URL_TESTE } from "./preparar-banco";

const { db, fechar } = abrirBanco(URL_TESTE);
afterAll(fechar);

const admin: Ator = { id: "u-admin", perfil: "administrador" };
const mariana: Ator = { id: "u-compras", perfil: "compras" };
const eliadna: Ator = { id: "u-hospital", perfil: "hospital" };

const PACIENTE = "Paciente Fictícia da Silva";

async function erroDoBanco(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as Error & { cause?: Error };
    return `${err.message} ${err.cause?.message ?? ""}`;
  }
  throw new Error("Era esperado que o banco recusasse");
}

beforeAll(async () => {
  await carregarCatalogoInicial(db);
});

describe("datas", () => {
  it("semana vai de segunda a domingo", () => {
    expect(semanaDe("2026-11-27")).toEqual({ inicio: "2026-11-23", fim: "2026-11-29" }); // sexta
    expect(semanaDe("2026-11-29")).toEqual({ inicio: "2026-11-23", fim: "2026-11-29" }); // domingo
    expect(semanaDe("2026-11-30")).toEqual({ inicio: "2026-11-30", fim: "2026-12-06" }); // segunda
  });

  it("hoje é calculado no fuso de São Paulo", () => {
    // 01:30 UTC de 28/11 ainda é 27/11 em São Paulo.
    expect(hojeSP(new Date("2026-11-28T01:30:00Z"))).toBe("2026-11-27");
  });
});

describe("procedimentos", () => {
  it("vêm cadastrados os da especificação", async () => {
    const lista = await listarProcedimentos(db);
    expect(lista.map((p) => p.codigo)).toEqual(
      expect.arrayContaining(["protese_mama", "mamoplastia", "lipo_axilar", "abdominoplastia", "lipoaspiracao", "lipoescultura_enxerto", "renuvion"]),
    );
    expect(lista.find((p) => p.codigo === "renuvion")?.tipo).toBe("tecnologia");
  });

  it("só o administrador cadastra e desativa; não se apaga", async () => {
    await expect(criarProcedimento(db, mariana, { nome: "Blefaroplastia", tipo: "procedimento" })).rejects.toThrow(ErroPermissao);
    const codigo = await criarProcedimento(db, admin, { nome: "Procedimento de Teste", tipo: "procedimento" });
    expect(codigo).toBe("procedimento_de_teste");
    await expect(criarProcedimento(db, admin, { nome: "procedimento de teste", tipo: "procedimento" })).rejects.toThrow("Já existe");
    await definirAtivoProcedimento(db, admin, codigo, false);
    expect((await listarProcedimentos(db)).some((p) => p.codigo === codigo)).toBe(false);
    expect(await erroDoBanco(db.delete(procedimentos).where(eq(procedimentos.codigo, codigo)))).toMatch(/Exclusão não permitida/);
    expect(await erroDoBanco(db.update(procedimentos).set({ codigo: "outro" }).where(eq(procedimentos.codigo, codigo)))).toMatch(/não pode mudar/);
  });
});

describe("cadastro de cirurgias", () => {
  let id: number;

  it("Mariana cadastra; Eliadna só consulta", async () => {
    const [chinelo] = await tamanhosDeChinelo(db);
    id = await criarCirurgia(db, mariana, {
      paciente: `  ${PACIENTE}  `,
      data: "2026-12-01",
      hora: "07:30",
      procedimentos: ["mamoplastia", "abdominoplastia"],
      chineloVarianteId: chinelo.id,
    });
    await expect(
      criarCirurgia(db, eliadna, { paciente: PACIENTE, data: "2026-12-01", procedimentos: ["mamoplastia"] }),
    ).rejects.toThrow(ErroPermissao);

    const c = await obterCirurgia(db, eliadna, id);
    expect(c).toMatchObject({ paciente: PACIENTE, data: "2026-12-01", hora: "07:30", situacao: "agendada", chinelo: chinelo.nome });
    expect(c?.procedimentos.map((p) => p.codigo).sort()).toEqual(["abdominoplastia", "mamoplastia"]);
  });

  it("valida nome completo, data, hora e procedimentos", async () => {
    const base = { paciente: PACIENTE, data: "2026-12-02", procedimentos: ["lipoaspiracao"] };
    await expect(criarCirurgia(db, admin, { ...base, paciente: "Maria" })).rejects.toThrow("nome");
    await expect(criarCirurgia(db, admin, { ...base, data: "2026-02-30" })).rejects.toThrow("Data inválida");
    await expect(criarCirurgia(db, admin, { ...base, hora: "25:00" })).rejects.toThrow("Hora inválida");
    await expect(criarCirurgia(db, admin, { ...base, procedimentos: [] })).rejects.toThrow("pelo menos um");
    await expect(criarCirurgia(db, admin, { ...base, procedimentos: ["inexistente"] })).rejects.toThrow("não existe");
    await expect(criarCirurgia(db, admin, { ...base, procedimentos: ["procedimento_de_teste"] })).rejects.toThrow("desativado");
    const [cola] = await db.execute<{ id: number }>(
      sql`select v.id from variantes v join produtos p on p.id = v.produto_id where p.nome ilike '%cola%' limit 1`,
    );
    await expect(criarCirurgia(db, admin, { ...base, chineloVarianteId: Number(cola.id) })).rejects.toThrow("chinelo");
  });

  it("a auditoria não guarda o nome da paciente", async () => {
    await atualizarCirurgia(db, mariana, id, {
      paciente: "Paciente Fictícia Souza",
      data: "2026-12-03",
      procedimentos: ["mamoplastia", "abdominoplastia", "renuvion"],
    });
    const eventos = await db.select().from(auditoria).where(eq(auditoria.entidadeId, String(id))).orderBy(desc(auditoria.id));
    expect(eventos.map((e) => e.acao)).toEqual(expect.arrayContaining(["cirurgia_criada", "cirurgia_alterada"]));
    const texto = JSON.stringify(eventos);
    expect(texto).not.toMatch(/Fictícia/);
    expect(eventos[0].detalhes).toMatchObject({ pacienteAlterado: true, depois: { data: "2026-12-03" } });
  });

  it("cancela com motivo, reativa e nunca apaga", async () => {
    await expect(cancelarCirurgia(db, mariana, id, { motivo: "" })).rejects.toThrow("motivo");
    await cancelarCirurgia(db, mariana, id, { motivo: "Paciente remarcou" });
    expect((await obterCirurgia(db, admin, id))?.situacao).toBe("cancelada");
    await expect(cancelarCirurgia(db, mariana, id, { motivo: "De novo" })).rejects.toThrow("já está cancelada");
    await reativarCirurgia(db, admin, id);
    expect((await obterCirurgia(db, admin, id))?.situacao).toBe("agendada");
    expect(await erroDoBanco(db.delete(cirurgias).where(eq(cirurgias.id, id)))).toMatch(/Exclusão não permitida/);
  });

  it("cirurgia com consumo confirmado não pode mais ser alterada", async () => {
    await db.update(cirurgias).set({ situacao: "consumo_confirmado" }).where(eq(cirurgias.id, id));
    await expect(
      atualizarCirurgia(db, admin, id, { paciente: PACIENTE, data: "2026-12-03", procedimentos: ["mamoplastia"] }),
    ).rejects.toThrow("já foi confirmado");
    await expect(cancelarCirurgia(db, admin, id, { motivo: "Teste" })).rejects.toThrow("já foi confirmado");
  });

  it("lista por período, em ordem de data e hora", async () => {
    await criarCirurgia(db, admin, { paciente: "Outra Paciente Teste", data: "2026-12-03", hora: "06:00", procedimentos: ["lipoaspiracao"] });
    await criarCirurgia(db, admin, { paciente: "Paciente Fora Semana", data: "2026-12-10", procedimentos: ["lipoaspiracao"] });
    const semana = semanaDe("2026-12-03");
    const lista = await listarCirurgias(db, eliadna, { de: semana.inicio, ate: semana.fim });
    expect(lista.map((c) => c.paciente)).toEqual(["Outra Paciente Teste", "Paciente Fictícia Souza"]);
  });
});
