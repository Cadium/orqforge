import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function createDatabase(databasePath: string) {
  const resolvedPath = resolve(databasePath);
  mkdirSync(dirname(resolvedPath), { recursive: true });

  const database = new DatabaseSync(resolvedPath);
  const schema = readFileSync(new URL("../../db/schema.sql", import.meta.url), "utf8");

  database.exec(schema);

  return database;
}

