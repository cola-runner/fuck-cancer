import type { MedicalSkill, ToolDefinition, ToolResult } from "./types.js";

const BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

export class GuidelinesSkill implements MedicalSkill {
  name = "guidelines";
  description =
    "Search PubMed for clinical practice guidelines and retrieve article summaries. Useful for finding evidence-based treatment recommendations.";

  tools: ToolDefinition[] = [
    {
      name: "pubmed_search_guidelines",
      description:
        "Search PubMed for clinical practice guidelines related to a medical topic. Returns PubMed IDs (PMIDs) that can be used to retrieve article summaries.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "The medical topic to search guidelines for (e.g. 'breast cancer treatment', 'type 2 diabetes management', 'hypertension')",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "pubmed_get_summary",
      description:
        "Get article summaries from PubMed for one or more PubMed IDs (PMIDs). Returns titles, authors, journal source, and publication dates.",
      parameters: {
        type: "object",
        properties: {
          pmids: {
            type: "array",
            items: { type: "string" },
            description:
              "Array of PubMed IDs to retrieve summaries for (obtained from pubmed_search_guidelines)",
          },
        },
        required: ["pmids"],
      },
    },
  ];

  async execute(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    switch (toolName) {
      case "pubmed_search_guidelines":
        return this.searchGuidelines(args.query as string);
      case "pubmed_get_summary":
        return this.getSummary(args.pmids as string[]);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }

  private async searchGuidelines(query: string): Promise<ToolResult> {
    try {
      const searchTerm = encodeURIComponent(`${query} AND guideline[pt]`);
      const url = `${BASE_URL}/esearch.fcgi?db=pubmed&retmode=json&retmax=5&term=${searchTerm}`;
      const response = await fetch(url);

      if (!response.ok) {
        return {
          success: false,
          error: `PubMed API error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as {
        esearchresult?: {
          count?: string;
          idlist?: string[];
        };
      };

      const pmids = data.esearchresult?.idlist ?? [];
      const totalCount = parseInt(data.esearchresult?.count ?? "0", 10);

      return {
        success: true,
        data: {
          query,
          totalResults: totalCount,
          pmids,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to search PubMed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async getSummary(pmids: string[]): Promise<ToolResult> {
    if (!pmids || pmids.length === 0) {
      return {
        success: false,
        error: "At least one PMID is required.",
      };
    }

    try {
      const idStr = pmids.join(",");
      const url = `${BASE_URL}/esummary.fcgi?db=pubmed&retmode=json&id=${idStr}`;
      const response = await fetch(url);

      if (!response.ok) {
        return {
          success: false,
          error: `PubMed API error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as {
        result?: Record<
          string,
          {
            uid?: string;
            title?: string;
            sortfirstauthor?: string;
            authors?: Array<{ name?: string }>;
            source?: string;
            pubdate?: string;
            fulljournalname?: string;
            elocationid?: string;
          }
        >;
      };

      const results = data.result ?? {};
      const articles: Array<{
        pmid: string;
        title: string;
        firstAuthor: string;
        authors: string[];
        journal: string;
        publicationDate: string;
        doi: string;
      }> = [];

      for (const pmid of pmids) {
        const article = results[pmid];
        if (article && article.uid) {
          articles.push({
            pmid: article.uid,
            title: article.title ?? "",
            firstAuthor: article.sortfirstauthor ?? "",
            authors: (article.authors ?? [])
              .map((a) => a.name ?? "")
              .filter(Boolean),
            journal: article.fulljournalname || article.source || "",
            publicationDate: article.pubdate ?? "",
            doi: article.elocationid ?? "",
          });
        }
      }

      return {
        success: true,
        data: {
          articles,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to fetch PubMed summaries: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
