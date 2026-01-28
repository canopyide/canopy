import { randomUUID } from "crypto";
import { store } from "../store.js";
import { events } from "./events.js";
import {
  AGENT_ACCESSIBLE_ACTIONS,
  type AppAgentConfig,
  type OneShotRunRequest,
  type OneShotRunResult,
  type AgentDecision,
} from "../../shared/types/appAgent.js";
import type { ActionManifestEntry, ActionContext } from "../../shared/types/actions.js";

const FIREWORKS_BASE_URL = "https://api.fireworks.ai/inference/v1";

const SYSTEM_PROMPT = `You are Canopy's app-wide assistant. You help users control the Canopy IDE by selecting and executing actions.

You have access to tools that represent available actions in the application. When a user asks you to do something, analyze their request and either:
1. Call the appropriate tool with the correct arguments
2. Ask a clarifying question if you need more information
3. Reply with a helpful message if you cannot fulfill the request

Guidelines:
- Only use the tools that are provided to you
- If the user's request is ambiguous, ask a clarifying question with specific choices
- Be concise in your responses
- If an action cannot be performed, explain why briefly`;

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OpenAIResponse {
  id: string;
  choices: Array<{
    index: number;
    message: OpenAIMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class AppAgentService {
  private inFlightRequest: AbortController | null = null;

  getConfig(): Omit<AppAgentConfig, "apiKey"> {
    const config = store.get("appAgentConfig");
    const { apiKey: _, ...safeConfig } = config;
    return safeConfig;
  }

  setConfig(config: Partial<AppAgentConfig>): void {
    const currentConfig = store.get("appAgentConfig");
    store.set("appAgentConfig", { ...currentConfig, ...config });
  }

  hasApiKey(): boolean {
    const config = store.get("appAgentConfig");
    return !!config.apiKey;
  }

  async testApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
    const config = store.get("appAgentConfig");
    const baseUrl = config.baseUrl || FIREWORKS_BASE_URL;

    let url: URL;
    try {
      url = new URL(`${baseUrl}/chat/completions`);
    } catch {
      return { valid: false, error: "Invalid base URL configured" };
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 15000);

    try {
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 1,
        }),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { valid: true };
      }

      if (response.status === 401) {
        return { valid: false, error: "Invalid API key" };
      }

      if (response.status === 403) {
        return { valid: false, error: "API key does not have access to this model" };
      }

      if (response.status === 429) {
        // Rate limited but key is valid
        return { valid: true };
      }

      const errorText = await response.text().catch(() => "");
      return { valid: false, error: `API error: ${response.status} ${errorText}`.trim() };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        return { valid: false, error: "Request timed out" };
      }

      return {
        valid: false,
        error: error instanceof Error ? error.message : "Failed to connect to API",
      };
    }
  }

  async testModel(model: string): Promise<{ valid: boolean; error?: string }> {
    console.log("\n========================================");
    console.log("[AppAgent] testModel called with:", model);
    console.log("========================================\n");

    const config = store.get("appAgentConfig");

    if (!config.apiKey) {
      console.log("[AppAgent] testModel: No API key configured");
      return { valid: false, error: "API key not configured" };
    }

    const baseUrl = config.baseUrl || FIREWORKS_BASE_URL;

    let url: URL;
    try {
      url = new URL(`${baseUrl}/chat/completions`);
    } catch {
      return { valid: false, error: "Invalid base URL configured" };
    }

    const requestBody = {
      model,
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1,
    };

    console.log("[AppAgent] testModel request:", {
      url: url.toString(),
      model,
      body: requestBody,
    });

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 15000);

    try {
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);

      console.log("[AppAgent] testModel response status:", response.status);

      if (response.ok) {
        console.log("[AppAgent] testModel: Success");
        return { valid: true };
      }

      if (response.status === 401) {
        return { valid: false, error: "API key is invalid" };
      }

      if (response.status === 404) {
        return { valid: false, error: "Model not found" };
      }

      if (response.status === 429) {
        // Rate limited but model is valid
        return { valid: true };
      }

      const errorText = await response.text().catch(() => "");
      console.log("[AppAgent] testModel error response:", errorText);
      return { valid: false, error: `API error: ${response.status} ${errorText}`.trim() };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        return { valid: false, error: "Request timed out" };
      }

      return {
        valid: false,
        error: error instanceof Error ? error.message : "Failed to connect to API",
      };
    }
  }

  async runOneShot(
    request: OneShotRunRequest,
    actions: ActionManifestEntry[],
    context: ActionContext
  ): Promise<OneShotRunResult> {
    const config = store.get("appAgentConfig");

    if (!config.apiKey) {
      return {
        success: false,
        error: "API key not configured. Please add your Fireworks API key in Settings.",
      };
    }

    if (this.inFlightRequest) {
      this.inFlightRequest.abort();
    }

    const traceId = randomUUID();
    const abortController = new AbortController();
    this.inFlightRequest = abortController;

    events.emit("agent:spawned", {
      agentId: `app-agent-${traceId}`,
      terminalId: "app-agent",
      type: "terminal",
      traceId,
      timestamp: Date.now(),
    });

    try {
      console.log("\n========================================");
      console.log("[AppAgent] runOneShot called");
      console.log("[AppAgent] Request prompt:", request.prompt);
      console.log("[AppAgent] Total actions passed:", actions.length);
      console.log("========================================\n");

      const agentActions = actions.filter(
        (action) =>
          AGENT_ACCESSIBLE_ACTIONS.includes(
            action.id as (typeof AGENT_ACCESSIBLE_ACTIONS)[number]
          ) && action.enabled
      );

      console.log("[AppAgent] Filtered agentActions:", agentActions.length);
      console.log(
        "[AppAgent] Agent action IDs:",
        agentActions.map((a) => a.id)
      );

      const tools = this.buildTools(agentActions);
      const messages = this.buildMessages(request, context);

      console.log("[AppAgent] Built tools count:", tools.length);
      console.log("[AppAgent] Tools:", JSON.stringify(tools, null, 2));

      const baseUrl = config.baseUrl || FIREWORKS_BASE_URL;
      let url: URL;
      try {
        url = new URL(`${baseUrl}/chat/completions`);
      } catch {
        return {
          success: false,
          error: "Invalid base URL configured. Please check your settings.",
          traceId,
        };
      }

      const requestBody = {
        model: config.model,
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.1,
      };

      console.log("[AppAgent] Full request body:", JSON.stringify(requestBody, null, 2));

      const timeoutId = setTimeout(() => abortController.abort(), 60000);

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);

      console.log("[AppAgent] Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.log("[AppAgent] Error response:", errorText);
        let errorMessage = `API request failed: ${response.status}`;

        if (response.status === 401) {
          errorMessage = "Invalid API key. Please check your Fireworks API key in Settings.";
        } else if (response.status === 429) {
          errorMessage = "Rate limit exceeded. Please try again in a moment.";
        } else if (response.status >= 500) {
          errorMessage = "Service temporarily unavailable. Please try again later.";
        }

        return {
          success: false,
          error: errorMessage,
          traceId,
          rawModelOutput: errorText,
        };
      }

      const data = (await response.json()) as OpenAIResponse;
      const choice = data.choices[0];

      if (!choice) {
        return {
          success: false,
          error: "No response from model",
          traceId,
        };
      }

      const decision = this.parseDecision(choice.message, agentActions);

      return {
        success: true,
        decision,
        traceId,
        rawModelOutput: JSON.stringify(choice.message, null, 2),
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          success: false,
          error: "Request cancelled",
          traceId,
        };
      }

      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

      events.emit("agent:failed", {
        agentId: `app-agent-${traceId}`,
        error: errorMessage,
        traceId,
        timestamp: Date.now(),
      });

      return {
        success: false,
        error: errorMessage,
        traceId,
      };
    } finally {
      this.inFlightRequest = null;
    }
  }

  cancel(): void {
    if (this.inFlightRequest) {
      this.inFlightRequest.abort();
      this.inFlightRequest = null;
    }
  }

  private buildTools(actions: ActionManifestEntry[]): OpenAITool[] {
    return actions.map((action) => ({
      type: "function" as const,
      function: {
        name: this.sanitizeToolName(action.name),
        description: action.description,
        parameters: this.sanitizeSchema(action.inputSchema),
      },
    }));
  }

  private sanitizeToolName(name: string): string {
    // OpenAI/Fireworks strips dots from tool names, so replace with underscores
    return name.replace(/\./g, "_");
  }

  private sanitizeSchema(schema: Record<string, unknown> | undefined): Record<string, unknown> {
    const defaultSchema = { type: "object", properties: {} };

    if (!schema) {
      return defaultSchema;
    }

    // Clone to avoid mutating original
    const sanitized = { ...schema };

    // Remove $schema - Fireworks/OpenAI doesn't support it
    delete sanitized["$schema"];

    // Handle anyOf from .optional() - unwrap if it contains an object type
    if (sanitized["anyOf"] && Array.isArray(sanitized["anyOf"])) {
      const objectSchema = (sanitized["anyOf"] as Array<Record<string, unknown>>).find(
        (s) => s.type === "object"
      );
      if (objectSchema) {
        // Merge the object schema properties into sanitized
        Object.assign(sanitized, objectSchema);
        delete sanitized["anyOf"];
      }
    }

    // Only add defaults if we don't have real structure
    if (!sanitized["type"]) {
      sanitized["type"] = "object";
    }
    if (sanitized["type"] === "object" && !sanitized["properties"]) {
      sanitized["properties"] = {};
    }

    return sanitized;
  }

  private buildMessages(request: OneShotRunRequest, context: ActionContext): OpenAIMessage[] {
    const messages: OpenAIMessage[] = [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
    ];

    const contextInfo: string[] = [];
    if (context.projectId) {
      contextInfo.push(`Current project: ${context.projectId}`);
    }
    if (context.activeWorktreeId) {
      contextInfo.push(`Active worktree: ${context.activeWorktreeId}`);
    }
    if (context.focusedTerminalId) {
      contextInfo.push(`Focused terminal: ${context.focusedTerminalId}`);
    }

    let userContent = request.prompt;
    if (contextInfo.length > 0) {
      userContent = `Context:\n${contextInfo.join("\n")}\n\nRequest: ${request.prompt}`;
    }

    if (request.clarificationChoice) {
      userContent += `\n\nUser selected: ${request.clarificationChoice}`;
    }

    messages.push({
      role: "user",
      content: userContent,
    });

    return messages;
  }

  private parseDecision(message: OpenAIMessage, actions: ActionManifestEntry[]): AgentDecision {
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0];
      const toolName = toolCall.function.name;

      // Match by sanitized tool name, then fall back to exact name/id
      const action = actions.find(
        (a) =>
          this.sanitizeToolName(a.name) === toolName || a.name === toolName || a.id === toolName
      );
      if (!action) {
        return {
          type: "reply",
          text: `I tried to use an action (${toolName}) that isn't available. Please try a different request.`,
        };
      }

      let args: Record<string, unknown> | undefined;
      const argsString = toolCall.function.arguments.trim();
      if (argsString && argsString !== "{}") {
        try {
          const parsedArgs = JSON.parse(argsString);
          if (parsedArgs && typeof parsedArgs === "object" && Object.keys(parsedArgs).length > 0) {
            args = parsedArgs;
          }
        } catch {
          return {
            type: "reply",
            text: `I tried to call ${action.title} but the arguments were malformed. Please try again.`,
          };
        }
      }

      return {
        type: "dispatch",
        id: action.id,
        args,
      };
    }

    if (message.content) {
      const content = message.content.trim();

      const clarifyMatch = this.parseClarificationFromContent(content);
      if (clarifyMatch) {
        return clarifyMatch;
      }

      return {
        type: "reply",
        text: content,
      };
    }

    return {
      type: "reply",
      text: "I couldn't understand how to help with that request.",
    };
  }

  private parseClarificationFromContent(content: string): AgentDecision | null {
    const questionPatterns = [
      /which\s+(\w+)\s+would\s+you\s+like/i,
      /do\s+you\s+want\s+to/i,
      /should\s+i/i,
      /would\s+you\s+prefer/i,
    ];

    const hasQuestion = questionPatterns.some((pattern) => pattern.test(content));
    if (!hasQuestion) {
      return null;
    }

    const choicePatterns = [
      /(?:^|\n)\s*[-*•]\s*(.+?)(?=\n|$)/gm,
      /(?:^|\n)\s*\d+[.)]\s*(.+?)(?=\n|$)/gm,
      /["']([^"']+)["']/g,
    ];

    const choices: Array<{ label: string; value: string }> = [];
    for (const pattern of choicePatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const label = match[1]?.trim();
        if (label && label.length < 100) {
          choices.push({ label, value: label });
        }
      }
      if (choices.length >= 2) break;
    }

    if (choices.length >= 2 && choices.length <= 6) {
      const questionMatch = content.match(/^[^.!?\n]+[.!?]/);
      const question = questionMatch ? questionMatch[0] : content.split("\n")[0];

      return {
        type: "ask",
        question,
        choices,
      };
    }

    return null;
  }
}

export const appAgentService = new AppAgentService();
