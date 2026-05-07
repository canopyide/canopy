import { createHash, timingSafeEqual } from "node:crypto";
import type { ActionManifestEntry } from "../../../shared/types/actions.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { mcpPaneConfigService } from "../McpPaneConfigService.js";
import type { HelpTokenValidator } from "./shared.js";
import { type McpTier, OPEN_WORLD_CATEGORIES, TIER_ALLOWLISTS } from "./shared.js";

const BEARER_HEADER_PATTERN = /^Bearer\s+(.+)$/i;

export function extractBearerToken(authHeader: string): string | null {
  const match = BEARER_HEADER_PATTERN.exec(authHeader);
  const token = match?.[1]?.trim();
  return token ? token : null;
}

export function precomputeApiKeyBearerHash(apiKey: string | null): Buffer | null {
  if (!apiKey) return null;
  return createHash("sha256").update(`Bearer ${apiKey}`).digest();
}

export function resolveBearer(token: string): McpTier | null {
  const paneTier = mcpPaneConfigService.getTierForToken(token);
  if (paneTier === "workbench" || paneTier === "action" || paneTier === "system") {
    return paneTier;
  }
  return null;
}

export function isAuthorized(
  authHeader: string,
  apiKeyBearerHash: Buffer | null,
  helpTokenValidator: HelpTokenValidator | null
): boolean {
  if (apiKeyBearerHash) {
    const actualHash = createHash("sha256").update(authHeader).digest();
    if (timingSafeEqual(actualHash, apiKeyBearerHash)) return true;
  } else if (authHeader.length === 0) {
    return true;
  }

  const token = extractBearerToken(authHeader);
  if (token === null) return false;

  if (mcpPaneConfigService.isValidPaneToken(token)) return true;

  if (helpTokenValidator) {
    const tier = helpTokenValidator(token);
    if (tier) return true;
  }

  return false;
}

export function resolveTokenTier(
  authHeader: string,
  apiKeyBearerHash: Buffer | null,
  helpTokenValidator: HelpTokenValidator | null
): McpTier {
  if (apiKeyBearerHash) {
    const actualHash = createHash("sha256").update(authHeader).digest();
    if (timingSafeEqual(actualHash, apiKeyBearerHash)) return "external";
  } else if (authHeader.length === 0) {
    return "external";
  }

  const token = extractBearerToken(authHeader);
  if (token === null) return "workbench";

  const paneTier = mcpPaneConfigService.getTierForToken(token);
  if (paneTier === "workbench" || paneTier === "action" || paneTier === "system") {
    return paneTier;
  }
  if (helpTokenValidator) {
    const helpTier = helpTokenValidator(token);
    if (helpTier) return helpTier;
  }

  return "workbench";
}

export function shouldExposeTool(
  entry: ActionManifestEntry,
  tier: McpTier,
  fullToolSurface: boolean
): boolean {
  if (entry.danger === "restricted") {
    return false;
  }
  if (tier === "external" && fullToolSurface) {
    return true;
  }
  return TIER_ALLOWLISTS[tier].has(entry.id);
}

export function isTierPermitted(
  tier: McpTier,
  actionId: string,
  fullToolSurface: boolean
): boolean {
  if (tier === "external" && fullToolSurface) {
    return true;
  }
  return TIER_ALLOWLISTS[tier].has(actionId);
}

export function buildToolDescription(entry: ActionManifestEntry): string {
  return entry.description;
}

export function buildToolInputSchema(entry: ActionManifestEntry): Record<string, unknown> {
  if (
    entry.inputSchema &&
    typeof entry.inputSchema === "object" &&
    !Array.isArray(entry.inputSchema) &&
    entry.inputSchema["type"] === "object"
  ) {
    return { ...entry.inputSchema, additionalProperties: false } as Record<string, unknown>;
  }
  return {
    type: "object",
    properties: {},
    additionalProperties: false,
  };
}

export function buildAnnotations(entry: ActionManifestEntry): ToolAnnotations {
  const overrides = entry.mcpAnnotations;
  const isQuery = entry.kind === "query";
  return {
    title: entry.title,
    readOnlyHint: overrides?.readOnlyHint ?? isQuery,
    idempotentHint: overrides?.idempotentHint ?? isQuery,
    destructiveHint: overrides?.destructiveHint ?? entry.danger === "confirm",
    openWorldHint: OPEN_WORLD_CATEGORIES.has(entry.category),
  };
}

export function buildToolOutputSchema(
  entry: ActionManifestEntry
): Record<string, unknown> | undefined {
  const schema = entry.outputSchema;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return undefined;
  if (schema["type"] !== "object") return undefined;
  return schema;
}

export function buildStructuredContent(
  entry: ActionManifestEntry | undefined,
  result: unknown
): Record<string, unknown> | undefined {
  if (!entry || !buildToolOutputSchema(entry)) return undefined;
  if (
    result === null ||
    result === undefined ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    result instanceof Error
  ) {
    return undefined;
  }
  return result as Record<string, unknown>;
}

export function parseToolArguments(rawArgs: unknown): { args: unknown } {
  if (!rawArgs || typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return { args: rawArgs ?? {} };
  }

  const argsRecord = rawArgs as Record<string, unknown>;
  if (!("_meta" in argsRecord)) {
    return { args: rawArgs };
  }

  const { _meta: _ignored, ...actionArgs } = argsRecord;
  return { args: Object.keys(actionArgs).length > 0 ? actionArgs : {} };
}
