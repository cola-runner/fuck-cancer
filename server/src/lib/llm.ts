import type { ToolDefinition, ToolResult } from "../skills/types.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface LLMProvider {
  chat(messages: ChatMessage[], options?: LLMOptions): Promise<string>;
  analyzeImage(imageBase64: string, prompt: string): Promise<string>;
  chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    executeToolFn: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<ToolResult>,
    options?: LLMOptions
  ): Promise<string>;
}

// ---------------------------------------------------------------------------
// Gemini (Google)
// ---------------------------------------------------------------------------
export class GeminiProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "gemini-2.0-flash") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(messages: ChatMessage[], options?: LLMOptions): Promise<string> {
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const systemInstruction = messages.find((m) => m.role === "system");

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens ?? 4096,
      },
    };
    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction.content }],
      };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${err}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("No text in Gemini response");
    }
    return text;
  }

  async analyzeImage(
    imageBase64: string,
    prompt: string
  ): Promise<string> {
    const body = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: imageBase64,
              },
            },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4096,
      },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${err}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }

  async chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    executeToolFn: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<ToolResult>,
    options?: LLMOptions
  ): Promise<string> {
    const systemInstruction = messages.find((m) => m.role === "system");

    // Build Gemini-format contents from messages
    const contents: Array<{
      role: string;
      parts: Array<Record<string, unknown>>;
    }> = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    // Build Gemini-format tool declarations
    const functionDeclarations = tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    const MAX_ROUNDS = 15;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const body: Record<string, unknown> = {
        contents,
        tools: [{ functionDeclarations }],
        generationConfig: {
          temperature: options?.temperature ?? 0.7,
          maxOutputTokens: options?.maxTokens ?? 4096,
        },
      };
      if (systemInstruction) {
        body.systemInstruction = {
          parts: [{ text: systemInstruction.content }],
        };
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${err}`);
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              text?: string;
              functionCall?: { name: string; args: Record<string, unknown> };
            }>;
          };
        }>;
      };

      const parts = data.candidates?.[0]?.content?.parts ?? [];

      // Check for function calls
      const functionCall = parts.find((p) => p.functionCall);
      if (functionCall?.functionCall) {
        const { name, args } = functionCall.functionCall;

        // Add the model's response (with functionCall) to contents
        contents.push({
          role: "model",
          parts: parts.map((p) => {
            if (p.functionCall) {
              return { functionCall: p.functionCall };
            }
            return { text: p.text ?? "" };
          }),
        });

        // Execute the tool
        const toolResult = await executeToolFn(name, args);

        // Add the function response
        contents.push({
          role: "function",
          parts: [
            {
              functionResponse: {
                name,
                response: {
                  content: toolResult.success
                    ? toolResult.data
                    : { error: toolResult.error },
                },
              },
            },
          ],
        });

        continue;
      }

      // No function call — return text
      const text = parts.find((p) => p.text)?.text;
      if (text) {
        return text;
      }
      throw new Error("No text or function call in Gemini response");
    }

    throw new Error("Exceeded maximum tool-call rounds for Gemini");
  }
}

// ---------------------------------------------------------------------------
// Claude (Anthropic)
// ---------------------------------------------------------------------------
export class ClaudeProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "claude-sonnet-4-20250514") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(messages: ChatMessage[], options?: LLMOptions): Promise<string> {
    const systemMsg = messages.find((m) => m.role === "system");
    const nonSystem = messages.filter((m) => m.role !== "system");

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      messages: nonSystem.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (systemMsg) {
      body.system = systemMsg.content;
    }
    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error ${response.status}: ${err}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    const text = data.content?.find((c) => c.type === "text")?.text;
    if (!text) {
      throw new Error("No text in Claude response");
    }
    return text;
  }

  async analyzeImage(
    imageBase64: string,
    prompt: string
  ): Promise<string> {
    const body = {
      model: this.model,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: imageBase64,
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error ${response.status}: ${err}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    return data.content?.find((c) => c.type === "text")?.text ?? "";
  }

  async chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    executeToolFn: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<ToolResult>,
    options?: LLMOptions
  ): Promise<string> {
    const systemMsg = messages.find((m) => m.role === "system");
    const nonSystem = messages.filter((m) => m.role !== "system");

    // Build Anthropic-format tools
    const anthropicTools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    // Use any[] for the mutable message list since Anthropic messages can have
    // mixed content types (string, tool_use blocks, tool_result blocks)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgList: Array<{ role: string; content: any }> = nonSystem.map(
      (m) => ({
        role: m.role,
        content: m.content,
      })
    );

    const MAX_ROUNDS = 15;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const body: Record<string, unknown> = {
        model: this.model,
        max_tokens: options?.maxTokens ?? 4096,
        messages: msgList,
        tools: anthropicTools,
      };
      if (systemMsg) {
        body.system = systemMsg.content;
      }
      if (options?.temperature !== undefined) {
        body.temperature = options.temperature;
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Claude API error ${response.status}: ${err}`);
      }

      const data = (await response.json()) as {
        content?: Array<{
          type: string;
          text?: string;
          id?: string;
          name?: string;
          input?: Record<string, unknown>;
        }>;
        stop_reason?: string;
      };

      const contentBlocks = data.content ?? [];

      // Check if the model wants to use tools
      const toolUseBlocks = contentBlocks.filter((c) => c.type === "tool_use");

      if (toolUseBlocks.length === 0 || data.stop_reason === "end_turn") {
        // No tool calls - return text
        const text = contentBlocks.find((c) => c.type === "text")?.text;
        if (text) {
          return text;
        }
        // If stop_reason is end_turn but we only have tool_use blocks, that shouldn't happen
        // but fall through to tool execution just in case
        if (toolUseBlocks.length === 0) {
          throw new Error("No text in Claude tool-use response");
        }
      }

      // Add the assistant's response to messages
      msgList.push({ role: "assistant", content: contentBlocks });

      // Execute each tool call and build tool_result blocks
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolResults: Array<Record<string, any>> = [];
      for (const block of toolUseBlocks) {
        const toolResult = await executeToolFn(
          block.name!,
          block.input ?? {}
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(
            toolResult.success ? toolResult.data : { error: toolResult.error }
          ),
        });
      }

      msgList.push({ role: "user", content: toolResults });
    }

    throw new Error("Exceeded maximum tool-call rounds for Claude");
  }
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------
export class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "gpt-4o") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(messages: ChatMessage[], options?: LLMOptions): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: options?.maxTokens ?? 4096,
    };

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${err}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error("No text in OpenAI response");
    }
    return text;
  }

  async analyzeImage(
    imageBase64: string,
    prompt: string
  ): Promise<string> {
    const body = {
      model: this.model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
      max_tokens: 4096,
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${err}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return data.choices?.[0]?.message?.content ?? "";
  }

  async chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    executeToolFn: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<ToolResult>,
    options?: LLMOptions
  ): Promise<string> {
    // Build OpenAI-format tools
    const openaiTools = tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    // Build mutable message list
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgList: Array<Record<string, any>> = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const MAX_ROUNDS = 15;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const body: Record<string, unknown> = {
        model: this.model,
        messages: msgList,
        tools: openaiTools,
        max_tokens: options?.maxTokens ?? 4096,
      };
      if (options?.temperature !== undefined) {
        body.temperature = options.temperature;
      }

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${err}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null;
            role?: string;
            tool_calls?: Array<{
              id: string;
              type: string;
              function: { name: string; arguments: string };
            }>;
          };
          finish_reason?: string;
        }>;
      };

      const choice = data.choices?.[0];
      const msg = choice?.message;

      if (!msg) {
        throw new Error("No message in OpenAI response");
      }

      const toolCalls = msg.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        // No tool calls - return text
        return msg.content ?? "";
      }

      // Add the assistant's message (with tool_calls) to the list
      msgList.push({
        role: "assistant",
        content: msg.content ?? null,
        tool_calls: toolCalls,
      });

      // Execute each tool call and add results
      for (const call of toolCalls) {
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(call.function.arguments);
        } catch {
          args = {};
        }

        const toolResult = await executeToolFn(call.function.name, args);

        msgList.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(
            toolResult.success ? toolResult.data : { error: toolResult.error }
          ),
        });
      }
    }

    throw new Error("Exceeded maximum tool-call rounds for OpenAI");
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function createLLMProvider(
  provider: string,
  apiKey: string
): LLMProvider {
  switch (provider) {
    case "gemini":
      return new GeminiProvider(apiKey);
    case "claude":
      return new ClaudeProvider(apiKey);
    case "openai":
      return new OpenAIProvider(apiKey);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
