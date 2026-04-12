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
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    google_token TEXT,
    llm_provider TEXT,
    llm_api_key TEXT,
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_name TEXT NOT NULL,
    diagnosis TEXT,
    notes TEXT,
    drive_folder_id TEXT,
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    drive_file_id TEXT NOT NULL,
    file_name TEXT,
    file_type TEXT,
    category TEXT,
    doc_date TEXT,
    ocr_text TEXT,
    ai_summary TEXT,
    ai_metadata TEXT,
    analysis_status TEXT NOT NULL DEFAULT 'not_requested',
    analysis_error TEXT,
    analysis_started_at INTEGER,
    analysis_completed_at INTEGER,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_cases_user_id ON cases(user_id);
  CREATE INDEX IF NOT EXISTS idx_documents_case_id ON documents(case_id);
  CREATE INDEX IF NOT EXISTS idx_documents_doc_date ON documents(doc_date);
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

ensureColumn("documents", "analysis_status TEXT NOT NULL DEFAULT 'not_requested'");
ensureColumn("documents", "analysis_error TEXT");
ensureColumn("documents", "analysis_started_at INTEGER");
ensureColumn("documents", "analysis_completed_at INTEGER");

export const db = drizzle(sqlite, { schema });
