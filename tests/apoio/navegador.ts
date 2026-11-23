import { abrirBanco, type Db } from "@/db/client";
import { criarAuth, type Auth } from "@/lib/auth";
import type { Perfil } from "@/lib/permissoes";
import { criarUsuarioDireto } from "@/lib/usuarios";
import { URL_TESTE } from "../preparar-banco";
import { codigoTotp } from "./totp";

export const BASE = "http://localhost:3000";

export function prepararAuth(): { auth: Auth; db: Db; fechar: () => Promise<void> } {
  const { db, fechar } = abrirBanco(URL_TESTE);
  const auth = criarAuth(db, { secret: "segredo-de-teste-com-mais-de-32-caracteres!", baseURL: BASE, producao: false });
  return { auth, db, fechar };
}

// IP aleatório por "navegador": o limite de tentativas é por IP e fica no banco
// entre arquivos de teste, então IPs repetidos fariam um teste atrapalhar outro.
const octeto = () => 1 + Math.floor(Math.random() * 254);

/** Simula um navegador: guarda cookies e fala com /api/auth como a tela faria. */
export class Navegador {
  private cookies = new Map<string, string>();
  readonly ip = `10.${octeto()}.${octeto()}.${octeto()}`;
  constructor(private auth: Auth) {}

  cabecalhos(): Headers {
    const h = new Headers({ origin: BASE, "x-forwarded-for": this.ip, "user-agent": "teste" });
    if (this.cookies.size) h.set("cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    return h;
  }

  async post(caminho: string, corpo: unknown = {}): Promise<{ status: number; json: Record<string, unknown> }> {
    const h = this.cabecalhos();
    h.set("content-type", "application/json");
    const resp = await this.auth.handler(
      new Request(`${BASE}/api/auth${caminho}`, { method: "POST", headers: h, body: JSON.stringify(corpo) }),
    );
    for (const c of resp.headers.getSetCookie()) {
      const [par] = c.split(";");
      const i = par.indexOf("=");
      const nome = par.slice(0, i);
      const valor = par.slice(i + 1);
      if (valor === "" || /max-age=0/i.test(c)) this.cookies.delete(nome);
      else this.cookies.set(nome, valor);
    }
    const texto = await resp.text();
    return { status: resp.status, json: texto ? JSON.parse(texto) : {} };
  }

  async sessao() {
    return this.auth.api.getSession({ headers: this.cabecalhos() });
  }
}

export type UsuarioPronto = { id: string; email: string; senha: string; totpURI: string };

/** Cria um usuário e faz todo o primeiro acesso: troca a senha e ativa o código. */
export async function usuarioPronto(auth: Auth, perfil: Perfil, sufixo: string): Promise<UsuarioPronto> {
  const email = `${perfil}.${sufixo}@clinica.test`;
  const temporaria = "Temporaria-123";
  const senha = "Senha-Definitiva-456";
  const id = await criarUsuarioDireto(auth, { nome: `Usuário ${sufixo}`, email, perfil, senha: temporaria });
  const nav = new Navegador(auth);
  await nav.post("/sign-in/email", { email, password: temporaria });
  await nav.post("/change-password", { currentPassword: temporaria, newPassword: senha });
  const { json } = await nav.post("/two-factor/enable", { password: senha });
  const totpURI = String(json.totpURI);
  await nav.post("/two-factor/verify-totp", { code: codigoTotp(totpURI) });
  await nav.post("/sign-out");
  return { id, email, senha, totpURI };
}

/** Login completo (senha + código) de um usuário já pronto. */
export async function entrar(auth: Auth, u: UsuarioPronto): Promise<Navegador> {
  const nav = new Navegador(auth);
  await nav.post("/sign-in/email", { email: u.email, password: u.senha });
  // Código do intervalo seguinte: o mesmo código não é aceito duas vezes seguidas.
  const r = await nav.post("/two-factor/verify-totp", { code: codigoTotp(u.totpURI) });
  if (r.status !== 200) {
    await nav.post("/two-factor/verify-totp", { code: codigoTotp(u.totpURI, Date.now() + 30_000) });
  }
  return nav;
}
