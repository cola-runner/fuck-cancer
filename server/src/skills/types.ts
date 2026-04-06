export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface MedicalSkill {
  name: string;
  description: string;
  tools: ToolDefinition[];
  execute(toolName: string, args: Record<string, unknown>): Promise<ToolResult>;
}
