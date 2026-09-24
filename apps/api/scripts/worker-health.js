import Database from "better-sqlite3";

try {
  const db = new Database(process.env.DATABASE_PATH || "/app/data/news.db", { readonly: true, fileMustExist: true });
  const state = db.prepare("SELECT heartbeat_at FROM worker_state WHERE id=1").get();
  db.close();
  if (!state || Date.now() - state.heartbeat_at > 180_000) process.exitCode = 1;
} catch { process.exitCode = 1; }
