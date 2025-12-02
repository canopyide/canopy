import { getAIClient, getAIModel } from "./client.js";
import { extractOutputText, formatErrorSnippet, withRetry } from "./utils.js";
import { ProjectIdentityResponseSchema } from "../../schemas/external.js";

export interface ProjectIdentity {
  emoji: string;
  title: string;
  gradientStart: string;
  gradientEnd: string;
}

export async function generateProjectIdentity(pathOrName: string): Promise<ProjectIdentity | null> {
  const client = getAIClient();
  if (!client) return null;

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
    return await withRetry(callModel, {
      maxRetries: 2,
      baseDelay: 300,
      shouldRetry: () => true,
    });
  } catch (error) {
    console.error("[AI] generateProjectIdentity failed:", error);
    return null;
  }
}

export async function generateProjectNameAndEmoji(
  projectPath: string
): Promise<{ name: string; emoji: string; color?: string } | null> {
  const identity = await generateProjectIdentity(projectPath);
  if (!identity) return null;

  return {
    name: identity.title,
    emoji: identity.emoji,
    color: identity.gradientStart, // Use start color as primary
  };
}
