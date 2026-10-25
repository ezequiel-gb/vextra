import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist/chromium-panel",
    sourcemap: false,
    rollupOptions: {
      input: {
        panel: resolve("panel.html"),
        settings: resolve("settings.html"),
      },
    },
  },
  worker: { format: "es" },
  test: { environment: "jsdom", globals: true },
} as Parameters<typeof defineConfig>[0]);
