import type { FastifyBaseLogger } from "fastify";
import { db } from "../db/index.js";
import { caseDrugs, documents } from "../db/schema.js";
import { withNotebookLM, RESEARCH_STEERING } from "./notebooklm.js";
import { trackSourceProcessing } from "./source-tracking.js";
import { and, eq } from "drizzle-orm";

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
const MAX_IMPORT_ATTEMPTS = 2;
const inFlightDrugCoverage = new Map<string, Promise<boolean>>();

const EXTRACTION_QUESTION =
  "仅基于这份资料,列出其中提到的所有药物名称。每行输出一个药品名,不要编号、不要解释、不要任何其他文字。如果资料中没有提到任何药物,只回答:无";

export interface DrugCoverageOptions {
  ask?: (
    notebookId: string,
    question: string,
    options: { sourceIds: string[] }
  ) => Promise<{ answer: string }>;
  importOfficialSources?: (
    caseId: string,
    notebookId: string,
    drug: string,
    logger: FastifyBaseLogger
  ) => Promise<boolean>;
}

type SourceTracker = (
  documentId: string,
  notebookId: string,
  sourceId: string,
  logger: FastifyBaseLogger
) => Promise<boolean>;

type SourceDeleter = (
  notebookId: string,
  sourceId: string
) => Promise<boolean>;

export async function importedSourcesReady(
  sources: Array<{ documentId: string; sourceId: string }>,
  notebookId: string,
  logger: FastifyBaseLogger,
  tracker: SourceTracker = trackSourceProcessing,
  deleteSource: SourceDeleter = (targetNotebookId, sourceId) =>
    withNotebookLM((client) =>
      client.sources.delete(targetNotebookId, sourceId)
    )
): Promise<boolean> {
  if (sources.length === 0) return false;

  const results = await Promise.all(
    sources.map(async (source) => ({
      source,
      ready: await tracker(
        source.documentId,
        notebookId,
        source.sourceId,
        logger
      ),
    }))
  );

  await Promise.all(
    results
      .filter(({ ready }) => !ready)
      .map(async ({ source }) => {
        try {
          const deleted = await deleteSource(notebookId, source.sourceId);
          if (!deleted) {
            logger.warn(
              { documentId: source.documentId, sourceId: source.sourceId },
              "Drug coverage: failed source could not be removed remotely"
            );
            return;
          }
          await db
            .delete(documents)
            .where(
              and(
                eq(documents.id, source.documentId),
                eq(documents.sourceId, source.sourceId)
              )
            );
        } catch (err) {
          logger.warn(
            {
              err,
              documentId: source.documentId,
              sourceId: source.sourceId,
            },
            "Drug coverage: failed source cleanup failed"
          );
        }
      })
  );
  return results.some(({ ready }) => ready);
}

export async function coverDrugsFromDocument(
  docId: string,
  caseId: string,
  notebookId: string,
  sourceId: string,
  logger: FastifyBaseLogger,
  options: DrugCoverageOptions = {}
): Promise<boolean> {
  try {
    const ask =
      options.ask ??
      ((targetNotebookId, question, askOptions) =>
        withNotebookLM((client) =>
          client.chat.ask(targetNotebookId, question, askOptions)
        ));
    const importSources =
      options.importOfficialSources ?? importOfficialSources;
    const extraction = await ask(notebookId, EXTRACTION_QUESTION, {
      sourceIds: [sourceId],
    });
    const drugs = parseDrugNames(extraction.answer);
    if (drugs.length === 0) return true;
    logger.info({ docId, drugs }, "Drug coverage: drugs mentioned in document");

    let allCovered = true;
    for (const drug of drugs) {
      const covered = await ensureDrugCovered(
        caseId,
        notebookId,
        drug,
        logger,
        importSources
      );
      if (!covered) allCovered = false;
    }
    return allCovered;
  } catch (err) {
    logger.warn({ err, docId }, "Drug coverage pipeline failed");
    return false;
  }
}

async function ensureDrugCovered(
  caseId: string,
  notebookId: string,
  drug: string,
  logger: FastifyBaseLogger,
  importSources: NonNullable<DrugCoverageOptions["importOfficialSources"]>
): Promise<boolean> {
  const claimKey = `${caseId}\0${drug}`;
  const existingTask = inFlightDrugCoverage.get(claimKey);
  if (existingTask) return existingTask;

  // Only successful coverage is durable. In-flight work lives in memory, so a
  // process crash cannot leave a permanent "covered" row before any source is
  // ready. Concurrent document pipelines in this self-hosted process await the
  // same task; the database unique index remains the final guard after success.
  const task = (async () => {
    const [existing] = await db
      .select({ id: caseDrugs.id })
      .from(caseDrugs)
      .where(
        and(
          eq(caseDrugs.caseId, caseId),
          eq(caseDrugs.drugName, drug)
        )
      )
      .limit(1);
    if (existing) return true;

    for (let attempt = 1; attempt <= MAX_IMPORT_ATTEMPTS; attempt += 1) {
      try {
        const covered = await importSources(
          caseId,
          notebookId,
          drug,
          logger
        );
        if (covered) {
          await db
            .insert(caseDrugs)
            .values({ caseId, drugName: drug })
            .onConflictDoNothing();
          return true;
        }
        logger.warn(
          { drug, caseId, attempt },
          "Drug coverage import produced no usable source"
        );
      } catch (err) {
        logger.warn(
          { err, drug, caseId, attempt },
          "Drug coverage import failed"
        );
      }
    }
    return false;
  })();

  inFlightDrugCoverage.set(claimKey, task);
  try {
    return await task;
  } finally {
    if (inFlightDrugCoverage.get(claimKey) === task) {
      inFlightDrugCoverage.delete(claimKey);
    }
  }
}

async function importOfficialSources(
  caseId: string,
  notebookId: string,
  drug: string,
  logger: FastifyBaseLogger
): Promise<boolean> {
  const task = await withNotebookLM((client) =>
    client.research.start(
      notebookId,
      `${drug} 药品说明书 用法用量 不良反应 药物相互作用 ${RESEARCH_STEERING}`,
      { mode: "fast" }
    )
  );
  if (!task) {
    logger.warn({ drug }, "Drug coverage: research request rejected");
    return false;
  }

  const result = await withNotebookLM((client) =>
    client.research.waitForResults(notebookId, task.taskId, {
      timeoutMs: 3 * 60 * 1000,
    })
  );
  if (result.status !== "completed") {
    logger.warn({ drug }, "Drug coverage: research timed out");
    return false;
  }

  const trusted = result.sources
    .filter((s) => s.url && trustRank(s.url) >= 0)
    .sort((a, b) => trustRank(a.url) - trustRank(b.url))
    .slice(0, MAX_IMPORTS_PER_DRUG);

  if (trusted.length === 0) {
    logger.info({ drug }, "Drug coverage: no trusted source in results");
    return false;
  }

  const imported = await withNotebookLM((client) =>
    client.research.importSources(notebookId, task.taskId, trusted)
  );
  const urlByTitle = new Map(trusted.map((s) => [s.title, s.url]));
  const trackedSources: Array<{ documentId: string; sourceId: string }> = [];

  for (const row of imported) {
    const [doc] = await db
      .insert(documents)
      .values({
        caseId,
        sourceId: row.id,
        fileName: row.title || `${drug} 用药资料`,
        fileType: "web",
        textContent: null,
        sourceUrl: urlByTitle.get(row.title) ?? null,
        origin: "auto",
        sourceStatus: "processing",
        sourceError: null,
        coverageStatus: "ready",
        coverageError: null,
      })
      .returning();
    trackedSources.push({ documentId: doc.id, sourceId: row.id });
  }

  const ready = await importedSourcesReady(
    trackedSources,
    notebookId,
    logger
  );
  logger.info(
    { drug, imported: imported.length, ready },
    "Drug coverage: official sources processed"
  );
  return ready;
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
