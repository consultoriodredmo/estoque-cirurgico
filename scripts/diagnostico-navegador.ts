/**
 * Diagnóstico com navegador de verdade (Chromium) contra o ambiente de teste
 * publicado: cria um usuário fictício e faz o primeiro acesso pelas telas.
 * Registra o status e o corpo de cada chamada de /api/auth (sem senhas).
 */
import "dotenv/config";
import { chromium, devices, webkit } from "playwright";
import { comBanco } from "../src/db/client";
import { criarAuth } from "../src/lib/auth";
import { lerEnvServidor } from "../src/lib/env";
import { criarUsuarioDireto, gerarSenhaTemporaria } from "../src/lib/usuarios";

async function main() {
  const env = lerEnvServidor();
  if (env.ambiente !== "teste") throw new Error("Só roda no ambiente de teste.");
  const base = env.baseUrl;
  const email = `navegador.${Date.now()}@teste.invalid`;
  const temp = gerarSenhaTemporaria();
  const nova = `${gerarSenhaTemporaria()}-N1`;
  await comBanco(env.databaseUrl, async (db) => {
    const auth = criarAuth(db, { secret: env.authSecret, baseURL: base, producao: false });
    await criarUsuarioDireto(auth, { nome: "Diagnóstico navegador", email, perfil: "hospital", senha: temp });
  });

  const motor = process.env.MOTOR === "webkit" ? webkit : chromium;
  console.log("motor:", process.env.MOTOR ?? "chromium");
  const browser = await motor.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await ctx.newPage();
  page.on("response", async (r) => {
    if (!r.url().includes("/api/auth/")) return;
    let corpo = "";
    try {
      corpo = (await r.text()).slice(0, 300).replace(/"totpURI":"[^"]+"/, '"totpURI":"…"').replace(/"backupCodes":\[[^\]]*\]/, '"backupCodes":[…]');
    } catch {}
    const cookies = (await r.headersArray()).filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value.split("=")[0]);
    console.log(`${r.request().method()} ${new URL(r.url()).pathname} → ${r.status()} ${corpo} set-cookie:[${cookies.join(",")}]`);
  });
  page.on("request", (q) => {
    if (q.url().includes("/api/auth/")) console.log(`  → ${new URL(q.url()).pathname} cookie:${q.headers()["cookie"] ? "sim" : "não"}`);
  });

  await page.goto(`${base}/entrar`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(temp);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/primeiro-acesso/);
  await page.getByLabel("Senha temporária").fill(temp);
  await page.getByLabel("Senha nova", { exact: true }).fill(nova);
  await page.getByLabel("Confirme a senha nova").fill(nova);
  await page.getByRole("button", { name: "Salvar senha" }).click();
  await page.getByLabel("Sua senha").waitFor();
  console.log("cookies do navegador:", (await ctx.cookies()).map((c) => `${c.name} secure=${c.secure} sameSite=${c.sameSite}`).join(" | "));
  await page.getByLabel("Sua senha").fill(nova);
  await page.getByRole("button", { name: "Continuar" }).click();
  try {
    await page.getByAltText("QR code para o aplicativo autenticador").waitFor({ timeout: 15000 });
    console.log("RESULTADO: QR code apareceu (funcionou)");
  } catch {
    console.log("RESULTADO: falhou —", (await page.locator("main").innerText()).slice(0, 300));
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
