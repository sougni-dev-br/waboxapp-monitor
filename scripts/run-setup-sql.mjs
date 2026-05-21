#!/usr/bin/env node
/**
 * Roda o arquivo deploy/setup.sql no Postgres apontado por DATABASE_URL.
 * Uso: DATABASE_URL="postgresql://..." node scripts/run-setup-sql.mjs
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import pg from "pg";

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const sqlPath = resolve(__dirname, "..", "deploy", "setup.sql");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não setada");
  process.exit(1);
}

const sql = readFileSync(sqlPath, "utf-8");
console.log(`[setup-sql] Conectando em ${url.replace(/:[^@]+@/, ":***@")}`);
console.log(`[setup-sql] Arquivo: ${sqlPath} (${sql.length} bytes)`);

const client = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log("[setup-sql] Conectado. Rodando script...");
  const result = await client.query(sql);
  // pg retorna array de resultados quando script tem múltiplos SELECTs
  if (Array.isArray(result)) {
    for (const r of result) {
      if (r.rows && r.rows.length > 0) {
        console.log("[setup-sql] →", r.rows);
      }
    }
  } else if (result.rows && result.rows.length > 0) {
    console.log("[setup-sql] →", result.rows);
  }
  console.log("[setup-sql] OK ✓");
} catch (err) {
  console.error("[setup-sql] ERRO:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
