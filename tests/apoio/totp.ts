import { createHmac } from "node:crypto";

/** TOTP (RFC 6238) — faz o papel do aplicativo autenticador nos testes. */
function base32(segredo: string): Buffer {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of segredo.replace(/=+$/, "").toUpperCase()) {
    const v = alfabeto.indexOf(c);
    if (v < 0) throw new Error(`caractere base32 inválido: ${c}`);
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function codigoTotp(totpURI: string, agora = Date.now()): string {
  const url = new URL(totpURI);
  const segredo = url.searchParams.get("secret")!;
  const periodo = Number(url.searchParams.get("period") ?? 30);
  const digitos = Number(url.searchParams.get("digits") ?? 6);
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(agora / 1000 / periodo)));
  const hmac = createHmac("sha1", base32(segredo)).update(contador).digest();
  const deslocamento = hmac[hmac.length - 1] & 0xf;
  const numero = (hmac.readUInt32BE(deslocamento) & 0x7fffffff) % 10 ** digitos;
  return String(numero).padStart(digitos, "0");
}
