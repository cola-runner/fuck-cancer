import type { MedicalSkill, ToolDefinition, ToolResult } from "./types.js";

const BASE_URL = "https://clinicaltables.nlm.nih.gov/api";

export class NIHClinicalSkill implements MedicalSkill {
  name = "nih-clinical";
  description =
    "NIH Clinical Tables API for searching medical conditions and lab test reference ranges. Useful for understanding diagnoses and interpreting lab results.";

  tools: ToolDefinition[] = [
    {
      name: "nih_search_conditions",
      description:
        "Search for medical conditions and diagnoses by name. Returns matching conditions with their codes and descriptions.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "The condition or diagnosis to search for (e.g. 'diabetes', 'breast cancer', 'hypertension')",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "nih_lab_reference",
      description:
        "Look up lab test reference information including standard units and test properties. Useful for understanding lab results and their normal ranges.",
      parameters: {
        type: "object",
        properties: {
          testName: {
            type: "string",
            description:
              "The lab test name to look up (e.g. 'hemoglobin', 'glucose', 'creatinine', 'white blood cell')",
          },
        },
        required: ["testName"],
      },
    },
  ];

  async execute(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    switch (toolName) {
      case "nih_search_conditions":
        return this.searchConditions(args.query as string);
      case "nih_lab_reference":
        return this.labReference(args.testName as string);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }

  private async searchConditions(query: string): Promise<ToolResult> {
    try {
      const url = `${BASE_URL}/conditions/v3/search?terms=${encodeURIComponent(query)}&maxList=5`;
      const response = await fetch(url);

      if (!response.ok) {
        return {
          success: false,
          error: `NIH Clinical Tables API error: ${response.status} ${response.statusText}`,
        };
      }

      // The API returns a JSON array: [totalCount, matchedCodes, extraFields, displayStrings]
      const data = (await response.json()) as [
        number,
        string[],
        Record<string, unknown> | null,
        string[][],
      ];

      const totalCount = data[0] ?? 0;
      const codes = data[1] ?? [];
      const displayStrings = data[3] ?? [];

      const results = codes.map((code, i) => ({
        code,
        name: displayStrings[i]?.[0] ?? code,
      }));

      return {
        success: true,
        data: {
          query,
          totalMatches: totalCount,
          results,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to search conditions: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async labReference(testName: string): Promise<ToolResult> {
    try {
      const url = `${BASE_URL}/loinc/v3/search?terms=${encodeURIComponent(testName)}&maxList=5&df=COMPONENT,PROPERTY,SCALE_TYP,EXAMPLE_UCUM_UNITS`;
      const response = await fetch(url);

      if (!response.ok) {
        return {
          success: false,
          error: `NIH Clinical Tables API error: ${response.status} ${response.statusText}`,
        };
      }

      // The API returns a JSON array: [totalCount, matchedCodes, extraFields, displayStrings]
      const data = (await response.json()) as [
        number,
        string[],
        Record<string, unknown> | null,
        string[][],
      ];

      const totalCount = data[0] ?? 0;
      const codes = data[1] ?? [];
      const displayStrings = data[3] ?? [];

      const results = codes.map((loincCode, i) => {
        const fields = displayStrings[i] ?? [];
        return {
          loincCode,
          component: fields[0] ?? "",
          property: fields[1] ?? "",
          scaleType: fields[2] ?? "",
          units: fields[3] ?? "",
        };
      });

      return {
        success: true,
        data: {
          query: testName,
          totalMatches: totalCount,
          results,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to look up lab reference: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
