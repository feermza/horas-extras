import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { viteSingleFile } from "vite-plugin-singlefile";

// Un solo HTML autocontenido, abrible con doble clic (file://).
// El plugin fija base "./", incrusta JS y CSS, y no deja módulos externos.
export default defineConfig({
  plugins: [
    vue(),
    viteSingleFile({ removeViteModuleLoader: true }),
  ],
  test: {
    environment: "node",
  },
});
