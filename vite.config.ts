import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

// Base path do app — em prod fica em sougni.com/monitor/, em dev na raiz.
// Pode ser sobrescrito via env VITE_APP_BASE (ex: VITE_APP_BASE=/ pra rodar na raiz).
const BASE_PATH = process.env.VITE_APP_BASE ?? (process.env.NODE_ENV === "production" ? "/monitor/" : "/");

export default defineConfig({
  base: BASE_PATH,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    host: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
