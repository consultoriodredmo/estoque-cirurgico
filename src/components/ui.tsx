import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Cartao({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-neutral-200 bg-white p-5 ${className}`}>{children}</div>;
}

export function Campo({
  rotulo,
  dica,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { rotulo: string; dica?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-neutral-800">{rotulo}</span>
      <input
        {...props}
        className="rounded-lg border border-neutral-300 px-3 py-2.5 text-base outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
      />
      {dica && <span className="text-xs text-neutral-500">{dica}</span>}
    </label>
  );
}

export function Botao({
  variante = "principal",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "principal" | "secundario" | "perigo" }) {
  const estilos = {
    principal: "bg-neutral-900 text-white hover:bg-neutral-700",
    secundario: "border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50",
    perigo: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
  }[variante];
  return (
    <button
      {...props}
      className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${estilos} ${className}`}
    />
  );
}

export function Aviso({ tipo = "erro", children }: { tipo?: "erro" | "ok" | "info"; children: ReactNode }) {
  if (!children) return null;
  const estilos = {
    erro: "border-red-200 bg-red-50 text-red-800",
    ok: "border-green-200 bg-green-50 text-green-800",
    info: "border-amber-200 bg-amber-50 text-amber-900",
  }[tipo];
  return (
    <p role={tipo === "erro" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${estilos}`}>
      {children}
    </p>
  );
}

export function TelaCentral({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[80dvh] w-full max-w-sm flex-col justify-center gap-6 px-5 py-10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Estoque Cirúrgico</p>
        <h1 className="mt-1 text-2xl font-semibold">{titulo}</h1>
      </div>
      {children}
    </main>
  );
}
