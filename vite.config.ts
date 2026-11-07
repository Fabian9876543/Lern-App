import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// base: "./" sorgt dafür, dass der Build auch in einem Unterordner
// (z. B. GitHub Pages unter /Lern-App/) funktioniert.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1600,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
