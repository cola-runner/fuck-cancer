import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../lib/config.js";

const dbPath = config.databasePath;
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Auto-create tables on first run so a fresh self-hosted install can boot
// before optional migration tooling is introduced.
//
// NOTE: installs from the old Google-Drive era (with `documents.drive_file_id
// NOT NULL`) should start from a fresh database — those rows only ever indexed
// Drive files, which no longer exist in this model. The ensureColumn() calls
// below add the new NotebookLM columns but cannot relax the old constraint.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    google_token TEXT,
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_name TEXT NOT NULL,
    diagnosis TEXT,
    notes TEXT,
    notebook_id TEXT,
    nlm_conversation_id TEXT,
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    source_id TEXT,
    file_name TEXT,
    file_type TEXT,
    text_content TEXT,
    source_url TEXT,
    source_status TEXT NOT NULL DEFAULT 'processing',
    source_error TEXT,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS case_drugs (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    drug_name TEXT NOT NULL,
    created_at INTEGER
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_case_drugs_unique ON case_drugs(case_id, drug_name);

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    "references" TEXT,
    created_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_cases_user_id ON cases(user_id);
  CREATE INDEX IF NOT EXISTS idx_documents_case_id ON documents(case_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_case_id ON conversations(case_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);
`);

function ensureColumn(table: string, definition: string): void {
  try {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("duplicate column name")) {
      throw error;
    }
  }
}

// Forward-migrate existing databases to the NotebookLM model.
ensureColumn("cases", "notebook_id TEXT");
ensureColumn("cases", "nlm_conversation_id TEXT");
ensureColumn("documents", "source_id TEXT");
ensureColumn("documents", "text_content TEXT");
ensureColumn("documents", "source_url TEXT");
ensureColumn("documents", "origin TEXT");
ensureColumn("documents", "source_status TEXT NOT NULL DEFAULT 'processing'");
ensureColumn("documents", "source_error TEXT");
ensureColumn("conversations", '"references" TEXT');

export const db = drizzle(sqlite, { schema });
