import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto";

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  email: text("email").notNull().unique(),
  name: text("name"),
  // Identity token from Google sign-in. NotebookLM storage is a single
  // server-side session (not per-user), so we no longer keep Drive tokens here.
  googleToken: text("google_token"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date()
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date()
  ),
});

export const cases = sqliteTable("cases", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  patientName: text("patient_name").notNull(),
  diagnosis: text("diagnosis"),
  notes: text("notes"),
  // The NotebookLM notebook backing this case (sources + grounded chat live here).
  notebookId: text("notebook_id"),
  // Most recent NotebookLM conversation id, threaded through for multi-turn chat.
  nlmConversationId: text("nlm_conversation_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date()
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date()
  ),
});

export const documents = sqliteTable("documents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  caseId: text("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  // NotebookLM source id. Nullable: addFile is async, so a row can exist while
  // the upload is still registering or if it failed.
  sourceId: text("source_id"),
  fileName: text("file_name"),
  fileType: text("file_type"),
  // Raw body for pasted text notes, kept so the UI can show them without a
  // round-trip to NotebookLM. Null for uploaded files.
  textContent: text("text_content"),
  // Original web URL for sources imported via NotebookLM research, so the UI
  // can link back to the page. Null for uploads and notes.
  sourceUrl: text("source_url"),
  // 'processing' | 'ready' | 'error' — mirrors the NotebookLM source status.
  sourceStatus: text("source_status")
    .notNull()
    .$defaultFn(() => "processing"),
  sourceError: text("source_error"),
  // null = user upload/note; 'research' = picked in the search modal;
  // 'auto' = imported by the drug-coverage pipeline. Auto/research docs never
  // re-trigger the pipeline (prevents import cascades).
  origin: text("origin"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date()
  ),
});

// Drugs already covered by auto-imported official sources, one row per
// (case, drug). A pipeline claims the drug here before researching, so
// concurrent uploads mentioning the same drug import its leaflet only once.
export const caseDrugs = sqliteTable(
  "case_drugs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    caseId: text("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    drugName: text("drug_name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
      () => new Date()
    ),
  },
  (t) => ({
    uniq: uniqueIndex("idx_case_drugs_unique").on(t.caseId, t.drugName),
  })
);

export const conversations = sqliteTable("conversations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  caseId: text("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  // Grounding citations returned by NotebookLM for an assistant turn (JSON).
  references: text("references", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date()
  ),
});
