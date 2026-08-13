import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: path.resolve(__dirname, "src/ui"),
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "dist/ui"),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 4318,
    strictPort: false,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4317",
        changeOrigin: false,
      },
    },
  },
});
