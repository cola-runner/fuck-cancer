import type { MedicalSkill, ToolDefinition, ToolResult } from "./types.js";

const BASE_URL = "https://api.fda.gov/drug";

export class OpenFDASkill implements MedicalSkill {
  name = "openfda";
  description =
    "OpenFDA drug adverse events and labeling data. Search for reported side effects and get official drug label information including warnings, dosage, and contraindications.";

  tools: ToolDefinition[] = [
    {
      name: "openfda_adverse_events",
      description:
        "Search for reported adverse events (side effects) for a specific drug. Returns the top 10 most frequently reported adverse reactions with their counts.",
      parameters: {
        type: "object",
        properties: {
          drugName: {
            type: "string",
            description:
              "The brand or generic drug name to search for adverse events (e.g. 'Lipitor', 'atorvastatin')",
          },
        },
        required: ["drugName"],
      },
    },
    {
      name: "openfda_drug_labeling",
      description:
        "Get official FDA drug labeling information including warnings, indications, dosage, and contraindications for a given drug.",
      parameters: {
        type: "object",
        properties: {
          drugName: {
            type: "string",
            description:
              "The brand or generic drug name to look up labeling for (e.g. 'Lipitor', 'atorvastatin')",
          },
        },
        required: ["drugName"],
      },
    },
  ];

  async execute(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    switch (toolName) {
      case "openfda_adverse_events":
        return this.adverseEvents(args.drugName as string);
      case "openfda_drug_labeling":
        return this.drugLabeling(args.drugName as string);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }

  private async adverseEvents(drugName: string): Promise<ToolResult> {
    try {
      const searchTerm = encodeURIComponent(
        `patient.drug.openfda.brand_name:"${drugName}"`
      );
      const url = `${BASE_URL}/event.json?search=${searchTerm}&count=patient.reaction.reactionmeddrapt.exact&limit=10`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: true,
            data: {
              drugName,
              message: "No adverse event reports found for this drug.",
              results: [],
            },
          };
        }
        return {
          success: false,
          error: `OpenFDA API error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as {
        results?: Array<{ term?: string; count?: number }>;
      };

      const reactions = (data.results ?? []).map((r) => ({
        reaction: r.term ?? "unknown",
        reportCount: r.count ?? 0,
      }));

      return {
        success: true,
        data: {
          drugName,
          topAdverseReactions: reactions,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to fetch adverse events: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async drugLabeling(drugName: string): Promise<ToolResult> {
    try {
      const searchTerm = encodeURIComponent(
        `openfda.brand_name:"${drugName}"`
      );
      const url = `${BASE_URL}/label.json?search=${searchTerm}&limit=1`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: true,
            data: {
              drugName,
              message: "No labeling information found for this drug.",
            },
          };
        }
        return {
          success: false,
          error: `OpenFDA API error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as {
        results?: Array<{
          openfda?: {
            brand_name?: string[];
            generic_name?: string[];
            manufacturer_name?: string[];
          };
          indications_and_usage?: string[];
          dosage_and_administration?: string[];
          warnings?: string[];
          warnings_and_cautions?: string[];
          contraindications?: string[];
          adverse_reactions?: string[];
          drug_interactions?: string[];
        }>;
      };

      const label = data.results?.[0];
      if (!label) {
        return {
          success: true,
          data: {
            drugName,
            message: "No labeling information found for this drug.",
          },
        };
      }

      // Extract first entry from each array field, truncating long texts
      const truncate = (text: string | undefined, max = 2000): string => {
        if (!text) return "";
        return text.length > max ? text.slice(0, max) + "..." : text;
      };

      return {
        success: true,
        data: {
          drugName,
          brandName: label.openfda?.brand_name?.[0] ?? drugName,
          genericName: label.openfda?.generic_name?.[0] ?? "",
          manufacturer: label.openfda?.manufacturer_name?.[0] ?? "",
          indications: truncate(label.indications_and_usage?.[0]),
          dosage: truncate(label.dosage_and_administration?.[0]),
          warnings: truncate(label.warnings?.[0] || label.warnings_and_cautions?.[0]),
          contraindications: truncate(label.contraindications?.[0]),
          adverseReactions: truncate(label.adverse_reactions?.[0]),
          drugInteractions: truncate(label.drug_interactions?.[0]),
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to fetch drug labeling: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
