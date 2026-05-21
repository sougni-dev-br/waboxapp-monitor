/**
 * DEV-ONLY: tudo que depende do pacote vite e do vite.config.ts vive aqui.
 * Este arquivo é importado dinamicamente via string variável em vite.ts,
 * portanto NÃO é resolvido pelo esbuild em build de produção.
 */
import type { Express } from "express";
import type { Server } from "http";
import fs from "fs";
import path from "path";

export async function setupViteDev(app: Express, server: Server): Promise<void> {
  const { createServer: createViteServer } = await import("vite");
  // @ts-ignore - resolvido em runtime apenas em dev (vite.config.ts não está nos paths)
  const viteConfigMod = await import("../../vite.config");
  const viteConfig = viteConfigMod.default;
  const { nanoid } = await import("nanoid");

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
