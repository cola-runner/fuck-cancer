import type { FastifyBaseLogger } from "fastify";
import { db } from "../db/index.js";
import { caseDrugs, documents } from "../db/schema.js";
import { withNotebookLM, RESEARCH_STEERING } from "./notebooklm.js";
import { trackSourceProcessing } from "./source-tracking.js";

/**
 * Auto drug coverage — the app's core safety feature.
 *
 * NotebookLM only grounds answers on sources inside the notebook; when a
 * question outruns the sources it can fall back to model memory and still
 * decorate the claims with citations. The defense is to make sure every drug
 * mentioned in the patient's documents has its official leaflet sitting in
 * the notebook BEFORE such questions get asked.
 *
 * After each user-uploaded document finishes processing:
 *   1. Ask the notebook itself (scoped to that one source) which drugs the
 *      document mentions — extraction needs no LLM of our own.
 *   2. For each drug not yet covered in this case, run a steered research
 *      task; NotebookLM's model finds the official label.
 *   3. Auto-import only results from trusted domains (DailyMed/FDA/...).
 *      Untrusted hits are dropped — manual search exists for those.
 */

// Domains trusted enough to import without user review, in priority order
// (official drug labels first). Hostnames match exactly or as subdomains.
const TRUSTED_DOMAINS = [
  "dailymed.nlm.nih.gov",
  "accessdata.fda.gov",
  "fda.gov",
  "medlineplus.gov",
  "clinicaltrials.gov",
  "nhc.gov.cn",
  "ema.europa.eu",
  "pubmed.ncbi.nlm.nih.gov",
  "pmc.ncbi.nlm.nih.gov",
  "cancer.gov",
];

const MAX_DRUGS_PER_DOCUMENT = 8;
const MAX_IMPORTS_PER_DRUG = 2;

const EXTRACTION_QUESTION =
  "仅基于这份资料,列出其中提到的所有药物名称。每行输出一个药品名,不要编号、不要解释、不要任何其他文字。如果资料中没有提到任何药物,只回答:无";

export async function coverDrugsFromDocument(
  docId: string,
  caseId: string,
  notebookId: string,
  sourceId: string,
  logger: FastifyBaseLogger
): Promise<void> {
  try {
    const extraction = await withNotebookLM((client) =>
      client.chat.ask(notebookId, EXTRACTION_QUESTION, {
        sourceIds: [sourceId],
      })
    );
    const drugs = parseDrugNames(extraction.answer);
    if (drugs.length === 0) return;
    logger.info({ docId, drugs }, "Drug coverage: drugs mentioned in document");

    for (const drug of drugs) {
      // Claim the drug for this case atomically; if it's already claimed (by
      // an earlier document or a concurrent pipeline) skip it. Failed imports
      // stay claimed on purpose — endless retries against a drug that has no
      // trusted source would loop on every upload.
      const claimed = await db
        .insert(caseDrugs)
        .values({ caseId, drugName: drug })
        .onConflictDoNothing()
        .returning();
      if (claimed.length === 0) continue;

      try {
        await importOfficialSources(caseId, notebookId, drug, logger);
      } catch (err) {
        logger.warn({ err, drug, caseId }, "Drug coverage import failed");
      }
    }
  } catch (err) {
    logger.warn({ err, docId }, "Drug coverage pipeline failed");
  }
}

async function importOfficialSources(
  caseId: string,
  notebookId: string,
  drug: string,
  logger: FastifyBaseLogger
): Promise<void> {
  const task = await withNotebookLM((client) =>
    client.research.start(
      notebookId,
      `${drug} 药品说明书 用法用量 不良反应 药物相互作用 ${RESEARCH_STEERING}`,
      { mode: "fast" }
    )
  );
  if (!task) {
    logger.warn({ drug }, "Drug coverage: research request rejected");
    return;
  }

  const result = await withNotebookLM((client) =>
    client.research.waitForResults(notebookId, task.taskId, {
      timeoutMs: 3 * 60 * 1000,
    })
  );
  if (result.status !== "completed") {
    logger.warn({ drug }, "Drug coverage: research timed out");
    return;
  }

  const trusted = result.sources
    .filter((s) => s.url && trustRank(s.url) >= 0)
    .sort((a, b) => trustRank(a.url) - trustRank(b.url))
    .slice(0, MAX_IMPORTS_PER_DRUG);

  if (trusted.length === 0) {
    logger.info({ drug }, "Drug coverage: no trusted source in results");
    return;
  }

  const imported = await withNotebookLM((client) =>
    client.research.importSources(notebookId, task.taskId, trusted)
  );
  const urlByTitle = new Map(trusted.map((s) => [s.title, s.url]));

  for (const row of imported) {
    const [doc] = await db
      .insert(documents)
      .values({
        caseId,
        sourceId: row.id,
        fileName: row.title || `${drug} 官方资料`,
        fileType: "web",
        textContent: null,
        sourceUrl: urlByTitle.get(row.title) ?? null,
        origin: "auto",
        sourceStatus: "processing",
        sourceError: null,
      })
      .returning();
    void trackSourceProcessing(doc.id, notebookId, row.id, logger);
  }

  logger.info(
    { drug, imported: imported.length },
    "Drug coverage: official sources imported"
  );
}

/** Index into TRUSTED_DOMAINS (lower = higher priority), or -1 if untrusted. */
function trustRank(url: string): number {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return -1;
  }
  return TRUSTED_DOMAINS.findIndex((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * Parse NotebookLM's drug-list answer: one name per line, but defensively
 * strip citation markers/bullets and drop prose-looking lines.
 */
function parseDrugNames(answer: string): string[] {
  const names = new Set<string>();
  for (const raw of answer.split("\n")) {
    const line = raw
      .replace(/\[\d+(?:[,\s-]*\d+)*\]/g, "")
      .replace(/^[\s*\-•·\d.、)(]+/, "")
      .trim();
    if (!line || line === "无") continue;
    if (line.length > 30 || /[:：。!?？]/.test(line)) continue;
    names.add(line);
    if (names.size >= MAX_DRUGS_PER_DOCUMENT) break;
  }
  return [...names];
}
