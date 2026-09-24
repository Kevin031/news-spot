import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

export function createDatabase(path) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  for (const name of ["001_init.sql", "002_worker.sql"]) {
    const migrationPath = fileURLToPath(new URL(`./migrations/${name}`, import.meta.url));
    db.exec(readFileSync(migrationPath, "utf8"));
  }
  return db;
}
