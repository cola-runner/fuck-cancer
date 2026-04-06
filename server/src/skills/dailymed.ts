import type { MedicalSkill, ToolDefinition, ToolResult } from "./types.js";

const BASE_URL = "https://dailymed.nlm.nih.gov/dailymed/services/v2";

export class DailyMedSkill implements MedicalSkill {
  name = "dailymed";
  description =
    "DailyMed official drug label database from the National Library of Medicine. Search for drugs and retrieve detailed structured product labeling (SPL) information.";

  tools: ToolDefinition[] = [
    {
      name: "dailymed_search_drug",
      description:
        "Search for a drug in DailyMed by name. Returns matching SPL (Structured Product Labeling) entries with their set IDs, which can be used to retrieve full label details.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description:
              "The drug name to search for (e.g. 'ibuprofen', 'Tylenol')",
          },
        },
        required: ["name"],
      },
    },
    {
      name: "dailymed_get_label",
      description:
        "Get the full drug label for a specific SPL set ID from DailyMed. Returns detailed label sections including indications, dosage, warnings, and adverse reactions.",
      parameters: {
        type: "object",
        properties: {
          setId: {
            type: "string",
            description:
              "The SPL set ID to retrieve (obtained from dailymed_search_drug results)",
          },
        },
        required: ["setId"],
      },
    },
  ];

  async execute(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    switch (toolName) {
      case "dailymed_search_drug":
        return this.searchDrug(args.name as string);
      case "dailymed_get_label":
        return this.getLabel(args.setId as string);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }

  private async searchDrug(name: string): Promise<ToolResult> {
    try {
      const url = `${BASE_URL}/spls.json?drug_name=${encodeURIComponent(name)}&page=1&pagesize=3`;
      const response = await fetch(url);

      if (!response.ok) {
        return {
          success: false,
          error: `DailyMed API error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as {
        data?: Array<{
          setid?: string;
          spl_version?: number;
          title?: string;
          published_date?: string;
        }>;
        metadata?: {
          total_elements?: number;
        };
      };

      const results = (data.data ?? []).map((item) => ({
        setId: item.setid ?? "",
        title: item.title ?? "",
        version: item.spl_version ?? 0,
        publishedDate: item.published_date ?? "",
      }));

      return {
        success: true,
        data: {
          searchTerm: name,
          totalResults: data.metadata?.total_elements ?? 0,
          results,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to search DailyMed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async getLabel(setId: string): Promise<ToolResult> {
    try {
      const url = `${BASE_URL}/spls/${encodeURIComponent(setId)}.json`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: true,
            data: {
              setId,
              message: "No label found for this SPL set ID.",
            },
          };
        }
        return {
          success: false,
          error: `DailyMed API error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as {
        title?: string;
        setid?: string;
        published_date?: string;
        effective_date?: string;
        products?: Array<{
          brand_name?: string;
          generic_name?: string;
          dosage_form?: string;
          route?: string;
          active_ingredients?: Array<{
            name?: string;
            strength?: string;
          }>;
        }>;
      };

      const products = (data.products ?? []).map((p) => ({
        brandName: p.brand_name ?? "",
        genericName: p.generic_name ?? "",
        dosageForm: p.dosage_form ?? "",
        route: p.route ?? "",
        activeIngredients: (p.active_ingredients ?? []).map((ai) => ({
          name: ai.name ?? "",
          strength: ai.strength ?? "",
        })),
      }));

      return {
        success: true,
        data: {
          setId: data.setid ?? setId,
          title: data.title ?? "",
          publishedDate: data.published_date ?? "",
          effectiveDate: data.effective_date ?? "",
          products,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to fetch DailyMed label: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
