import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/preparar-banco.ts"],
    // Os testes usam o mesmo banco; rodar em sequência evita interferência.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
