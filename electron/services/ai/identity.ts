import { getAIClient, getAIModel, getAIUnavailableReason } from "./client.js";
import { extractOutputText, formatErrorSnippet, withRetry } from "./utils.js";
import { ProjectIdentityResponseSchema } from "../../schemas/external.js";

export interface ProjectIdentity {
  emoji: string;
  title: string;
  gradientStart: string;
  gradientEnd: string;
}

export interface IdentityGenerationError {
  code: "no_key" | "disabled" | "api_error" | "model_not_found" | "rate_limit" | "invalid_response";
  message: string;
}

export interface IdentityGenerationResult {
  success: boolean;
  identity?: ProjectIdentity;
  error?: IdentityGenerationError;
}

export async function generateProjectIdentity(
  pathOrName: string
): Promise<IdentityGenerationResult> {
  const client = getAIClient();
  if (!client) {
    const reason = getAIUnavailableReason();
    if (reason === "no_key") {
      return {
        success: false,
        error: {
          code: "no_key",
          message: "No OpenAI API key configured. Please add your API key in Settings.",
        },
      };
    }
    return {
      success: false,
      error: {
        code: "disabled",
        message:
          "AI features are disabled. Enable them in Settings > AI Features > Advanced Options.",
      },
    };
  }

  const model = getAIModel();

  const callModel = async (): Promise<ProjectIdentity> => {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `You create visual identities for software projects. Given a project path or name:
1. Choose a representative emoji that reflects the project's likely purpose
2. Convert the folder name to a readable Title Case format (remove hyphens/underscores, capitalize words)
3. Pick two bright/neon/pastel gradient colors that work well together for a dark theme UI

Guidelines:
- Emoji should match the tech stack or purpose (e.g., React/web, CLI tool, mobile app, AI/ML, backend, etc.)
- Title should be clean and readable (e.g., "canopy-app" -> "Canopy App")
- Colors should be vibrant but not harsh. Good examples: #00D4FF, #FF6B6B, #4ADE80, #FBBF24, #A855F7
- Avoid dark colors like #000, #333, etc.

Respond with JSON:
{"emoji": "...", "title": "...", "gradientStart": "#hex", "gradientEnd": "#hex"}`,
        },
        {
          role: "user",
          content: `Project path: "${pathOrName}"`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 128,
    });

    const text = extractOutputText(response);
    if (!text) {
      throw new Error(`Identity: empty response from model. Raw: ${formatErrorSnippet(response)}`);
    }

    try {
      const parsed = JSON.parse(text);

      const validated = ProjectIdentityResponseSchema.safeParse(parsed);
      if (validated.success) {
        return validated.data;
      }

      const errorDetails = validated.error.format();
      console.warn("[AI] Identity validation failed:", errorDetails);

      // Fallback to manual validation for partial responses
      if (parsed && typeof parsed === "object") {
        if (
          typeof parsed.emoji === "string" &&
          typeof parsed.title === "string" &&
          typeof parsed.gradientStart === "string" &&
          typeof parsed.gradientEnd === "string"
        ) {
          const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
          const startValid = hexColorRegex.test(parsed.gradientStart);
          const endValid = hexColorRegex.test(parsed.gradientEnd);

          if (startValid && endValid) {
            return parsed as ProjectIdentity;
          }

          // Colors are invalid - use safe defaults
          console.warn(
            "[AI] Identity colors failed validation, using defaults:",
            parsed.gradientStart,
            parsed.gradientEnd
          );
          return {
            emoji: parsed.emoji,
            title: parsed.title,
            gradientStart: "#4ADE80", // Safe default green
            gradientEnd: "#3B82F6", // Safe default blue
          };
        }
      }

      throw new Error(`Invalid response structure: ${JSON.stringify(errorDetails)}`);
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : String(parseError);
      throw new Error(
        `Identity: failed to parse/validate JSON. ${message}. Raw: ${formatErrorSnippet(text)}`
      );
    }
  };

  try {
    const identity = await withRetry(callModel, {
      maxRetries: 2,
      baseDelay: 300,
      shouldRetry: (error) => {
        const errorObj = error as { status?: number };
        const status = errorObj.status;
        // Only retry on transient errors (429 rate limit, 5xx server errors)
        // Don't retry on 401 (invalid key), 404 (model not found), or parse errors
        if (status === 401 || status === 404) return false;
        if (status && status >= 500) return true;
        if (status === 429) return true;
        // Retry network/timeout errors (no status)
        if (!status) return true;
        return false;
      },
    });
    return { success: true, identity };
  } catch (error) {
    console.error("[AI] generateProjectIdentity failed:", error);

    // Parse OpenAI API errors for more specific messages
    const errorObj = error as { status?: number; message?: string; code?: string };
    const status = errorObj.status;
    const errorMessage = errorObj.message || String(error);

    if (status === 401) {
      return {
        success: false,
        error: {
          code: "api_error",
          message: "Invalid API key. Please check your OpenAI API key in Settings.",
        },
      };
    }

    if (status === 404) {
      return {
        success: false,
        error: {
          code: "model_not_found",
          message: `Model '${model}' not available. Try changing to 'gpt-4o-mini' in Settings > AI Features.`,
        },
      };
    }

    if (status === 429) {
      return {
        success: false,
        error: {
          code: "rate_limit",
          message: "OpenAI rate limit exceeded. Please wait a moment and try again.",
        },
      };
    }

    if (errorMessage.includes("parse") || errorMessage.includes("Invalid response")) {
      return {
        success: false,
        error: {
          code: "invalid_response",
          message: "Failed to parse AI response. Please try again.",
        },
      };
    }

    return {
      success: false,
      error: {
        code: "api_error",
        message: `AI request failed: ${errorMessage}`,
      },
    };
  }
}

export async function generateProjectNameAndEmoji(
  projectPath: string
): Promise<{ name: string; emoji: string; color?: string } | null> {
  const result = await generateProjectIdentity(projectPath);
  if (!result.success || !result.identity) return null;

  return {
    name: result.identity.title,
    emoji: result.identity.emoji,
    color: result.identity.gradientStart,
  };
}
