import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Zwei Varianten:
//   npm run build            → dist/           (Web-Version, Claude-API)
//   npm run build:artifact   → dist-artifact/  (claude.ai-Version, Claude-Abo)
// base: "./" sorgt dafür, dass der Build auch in einem Unterordner funktioniert.
export default defineConfig(({ mode }) => {
  const artifact = mode === "artifact";
  const target = artifact ? "./src/targets/artifact/index.ts" : "./src/targets/web/index.ts";
  return {
    base: "./",
    plugins: [react()],
    define: {
      "import.meta.env.VITE_TARGET": JSON.stringify(artifact ? "artifact" : "web"),
    },
    resolve: {
      alias: { "@platform-impl": new URL(target, import.meta.url).pathname },
    },
    build: {
      outDir: artifact ? "dist-artifact" : "dist",
      emptyOutDir: true,
      chunkSizeWarningLimit: 1600,
      // In claude.ai werden die KaTeX-Schriften direkt ins CSS eingebettet.
      assetsInlineLimit: artifact ? (file: string) => (file.endsWith(".woff2") ? true : undefined) : undefined,
    },
    test: {
      environment: "node",
      include: ["tests/**/*.test.ts"],
    },
  };
});
