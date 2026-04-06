import type { MedicalSkill, ToolDefinition, ToolResult } from "./types.js";

const BASE_URL = "https://rxnav.nlm.nih.gov/REST";

export class RxNormSkill implements MedicalSkill {
  name = "rxnorm";
  description =
    "RxNorm drug information and interaction checker. Search drugs by name and check interactions between multiple drugs.";

  tools: ToolDefinition[] = [
    {
      name: "rxnorm_search_drug",
      description:
        "Search for a drug by name and get its RxNorm concept identifiers (RxCUI). Returns matching drug concepts with their RxCUI IDs, which can be used to check interactions.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The drug name to search for (e.g. 'aspirin', 'metformin')",
          },
        },
        required: ["name"],
      },
    },
    {
      name: "rxnorm_check_interactions",
      description:
        "Check for known drug-drug interactions between two or more drugs using their RxCUI identifiers. Returns interaction pairs with severity and description.",
      parameters: {
        type: "object",
        properties: {
          rxcuis: {
            type: "array",
            items: { type: "string" },
            description:
              "Array of RxCUI identifiers to check for interactions (at least 2). Use rxnorm_search_drug first to get RxCUIs.",
          },
        },
        required: ["rxcuis"],
      },
    },
  ];

  async execute(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    switch (toolName) {
      case "rxnorm_search_drug":
        return this.searchDrug(args.name as string);
      case "rxnorm_check_interactions":
        return this.checkInteractions(args.rxcuis as string[]);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }

  private async searchDrug(name: string): Promise<ToolResult> {
    try {
      const url = `${BASE_URL}/drugs.json?name=${encodeURIComponent(name)}`;
      const response = await fetch(url);

      if (!response.ok) {
        return {
          success: false,
          error: `RxNorm API error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as {
        drugGroup?: {
          name?: string;
          conceptGroup?: Array<{
            tty?: string;
            conceptProperties?: Array<{
              rxcui?: string;
              name?: string;
              synonym?: string;
              tty?: string;
            }>;
          }>;
        };
      };

      const concepts: Array<{ rxcui: string; name: string; type: string }> = [];
      const groups = data.drugGroup?.conceptGroup ?? [];
      for (const group of groups) {
        if (group.conceptProperties) {
          for (const prop of group.conceptProperties) {
            if (prop.rxcui && prop.name) {
              concepts.push({
                rxcui: prop.rxcui,
                name: prop.name,
                type: prop.tty ?? "unknown",
              });
            }
          }
        }
      }

      return {
        success: true,
        data: {
          searchTerm: name,
          results: concepts.slice(0, 10),
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to search RxNorm: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async checkInteractions(rxcuis: string[]): Promise<ToolResult> {
    if (!rxcuis || rxcuis.length < 2) {
      return {
        success: false,
        error: "At least 2 RxCUI identifiers are required to check interactions.",
      };
    }

    try {
      const rxcuiStr = rxcuis.join("+");
      const url = `${BASE_URL}/interaction/list.json?rxcuis=${rxcuiStr}`;
      const response = await fetch(url);

      if (!response.ok) {
        return {
          success: false,
          error: `RxNorm API error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as {
        fullInteractionTypeGroup?: Array<{
          fullInteractionType?: Array<{
            comment?: string;
            minConcept?: Array<{ rxcui?: string; name?: string }>;
            interactionPair?: Array<{
              severity?: string;
              description?: string;
            }>;
          }>;
        }>;
      };

      const interactions: Array<{
        drugs: string[];
        severity: string;
        description: string;
      }> = [];

      const groups = data.fullInteractionTypeGroup ?? [];
      for (const group of groups) {
        for (const interaction of group.fullInteractionType ?? []) {
          const drugNames = (interaction.minConcept ?? []).map(
            (c) => c.name ?? "unknown"
          );
          for (const pair of interaction.interactionPair ?? []) {
            interactions.push({
              drugs: drugNames,
              severity: pair.severity ?? "unknown",
              description: pair.description ?? "No description available",
            });
          }
        }
      }

      return {
        success: true,
        data: {
          rxcuis,
          interactionCount: interactions.length,
          interactions,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to check interactions: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
