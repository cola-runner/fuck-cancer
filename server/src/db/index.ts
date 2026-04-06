import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const dbPath = process.env.DATABASE_PATH || "./data/fuckcancer.db";
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Auto-create tables on first run
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

export const db = drizzle(sqlite, { schema });
