import type { MedicalSkill, ToolDefinition, ToolResult } from "./types.js";
import { RxNormSkill } from "./rxnorm.js";
import { OpenFDASkill } from "./openfda.js";
import { DailyMedSkill } from "./dailymed.js";
import { NIHClinicalSkill } from "./nih-clinical.js";
import { GuidelinesSkill } from "./guidelines.js";

export type { ToolDefinition, ToolResult } from "./types.js";

export class SkillRegistry {
  private skills: Map<string, MedicalSkill> = new Map();
  private toolToSkill: Map<string, MedicalSkill> = new Map();

  constructor() {
    this.register(new RxNormSkill());
    this.register(new OpenFDASkill());
    this.register(new DailyMedSkill());
    this.register(new NIHClinicalSkill());
    this.register(new GuidelinesSkill());
  }

  private register(skill: MedicalSkill): void {
    this.skills.set(skill.name, skill);
    for (const tool of skill.tools) {
      this.toolToSkill.set(tool.name, skill);
    }
  }

  /** Returns all tool definitions across every registered skill. */
  getToolDefinitions(): ToolDefinition[] {
    const defs: ToolDefinition[] = [];
    for (const skill of this.skills.values()) {
      defs.push(...skill.tools);
    }
    return defs;
  }

  /** Route a tool call to its owning skill and execute it. */
  async executeTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const skill = this.toolToSkill.get(toolName);
    if (!skill) {
      return { success: false, error: `Unknown tool: ${toolName}` };
    }
    return skill.execute(toolName, args);
  }
}
