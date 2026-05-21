import express, { type Express } from "express";
import fs from "fs";
import path from "path";

/**
 * Em produção, este é o ÚNICO ponto de contato com o frontend buildado.
 * NÃO importa vite — assim o bundle de produção não precisa de devDependencies.
 */
export function serveStatic(app: Express) {
  // dist/public está ao lado de dist/index.js quando rodando em produção
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fallback para SPA — qualquer rota não-API serve index.html
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

/**
 * Dev-only — importa vite via require dinâmico para evitar resolver em build de prod.
 * Esta função NÃO é chamada em produção; só existe como wrapper de import seguro.
 */
export async function setupVite(app: Express, server: import("http").Server): Promise<void> {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("setupVite só pode ser chamado em desenvolvimento");
  }
  // Import com string variável: esbuild não consegue resolver em build time,
  // o que evita bundlar/exigir vite e devDeps em produção.
  const viteDevPath = "./viteDev.js";
  const mod = await import(viteDevPath);
  await mod.setupViteDev(app, server);
}
