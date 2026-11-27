/**
 * Diagnóstico do login no AMBIENTE DE TESTE publicado: cria um usuário
 * fictício e percorre, contra o endereço real, o primeiro acesso completo.
 * Mostra status e códigos de erro; nunca imprime senhas, cookies ou chaves.
 */
import "dotenv/config";
import { comBanco } from "../src/db/client";
import { criarAuth } from "../src/lib/auth";
import { lerEnvServidor } from "../src/lib/env";
import { criarUsuarioDireto, gerarSenhaTemporaria } from "../src/lib/usuarios";

const jar = new Map<string, string>();
let base = "";

async function post(caminho: string, corpo: unknown) {
  const h = new Headers({ "content-type": "application/json", origin: base });
  if (jar.size) h.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
  const r = await fetch(`${base}/api/auth${caminho}`, { method: "POST", headers: h, body: JSON.stringify(corpo), redirect: "manual" });
  const nomes: string[] = [];
  for (const c of r.headers.getSetCookie()) {
    const [par, ...atributos] = c.split(";");
    const i = par.indexOf("=");
    const nome = par.slice(0, i);
    const valor = par.slice(i + 1);
    nomes.push(`${nome}${valor ? "" : "(apagado)"} [${atributos.map((a) => a.trim().split("=")[0]).join(",")}]`);
    if (!valor || /max-age=0/i.test(c)) jar.delete(nome);
    else jar.set(nome, valor);
  }
  const texto = await r.text();
  let resumo = texto.slice(0, 200);
  try {
    const j = JSON.parse(texto);
    resumo = JSON.stringify({ code: j.code, message: j.message, twoFactorRedirect: j.twoFactorRedirect, temURI: !!j.totpURI, user: j.user ? { deveTrocarSenha: j.user.deveTrocarSenha, twoFactorEnabled: j.user.twoFactorEnabled } : undefined });
  } catch {}
  console.log(`${caminho} → ${r.status} ${resumo}\n   cookies recebidos: ${nomes.join(" | ") || "nenhum"}\n   cookies no pote: ${[...jar.keys()].join(", ")}`);
  return r.status;
}

async function main() {
  const env = lerEnvServidor();
  if (env.ambiente !== "teste") throw new Error("Só roda no ambiente de teste.");
  base = env.baseUrl;
  const email = `diagnostico.${Date.now()}@teste.invalid`;
  const temp = gerarSenhaTemporaria();
  const nova = `${gerarSenhaTemporaria()}-N1`;
  await comBanco(env.databaseUrl, async (db) => {
    const auth = criarAuth(db, { secret: env.authSecret, baseURL: env.baseUrl, producao: false });
    await criarUsuarioDireto(auth, { nome: "Diagnóstico automático", email, perfil: "hospital", senha: temp });
  });
  console.log(`Endereço: ${base}`);
  await post("/sign-in/email", { email, password: temp });
  await post("/change-password", { currentPassword: temp, newPassword: nova, revokeOtherSessions: true });
  const h = new Headers({ cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") });
  const s = await fetch(`${base}/api/auth/get-session`, { headers: h });
  console.log(`/get-session → ${s.status} ${(await s.text()).length > 10 ? "com sessão" : "sem sessão"}`);
  await post("/two-factor/enable", { password: nova });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
