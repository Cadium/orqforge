import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function createDatabase(databasePath: string) {
  const resolvedPath = resolve(databasePath);
  mkdirSync(dirname(resolvedPath), { recursive: true });

  const database = new DatabaseSync(resolvedPath);
  const schema = readFileSync(new URL("../../db/schema.sql", import.meta.url), "utf8");

  database.exec(schema);
  ensureSchemaCompat(database);

  return database;
}

function ensureSchemaCompat(database: DatabaseSync) {
  const columns = database
    .prepare("PRAGMA table_info(deployments)")
    .all() as Array<{ name: string }>;

  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has("app_name")) {
    database.exec("ALTER TABLE deployments ADD COLUMN app_name TEXT");
  }

  database.exec(`
    UPDATE deployments
    SET app_name = COALESCE(NULLIF(app_name, ''), slug)
    WHERE app_name IS NULL OR app_name = ''
  `);
}
