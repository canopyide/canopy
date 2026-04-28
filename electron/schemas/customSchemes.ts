/**
 * Zod schemas for custom color schemes (app theme + terminal config).
 * Permissive on read (accepts legacy string), strict on write.
 */

import { z } from "zod";

const appColorSchemeTokenSchema = z.record(z.string(), z.string());

export const appColorSchemeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["dark", "light"]),
  builtin: z.boolean(),
  tokens: appColorSchemeTokenSchema,
  palette: z.record(z.string(), z.string()).optional(),
  extensions: z.record(z.string(), z.string()).optional(),
  location: z.string().optional(),
  heroImage: z.string().optional(),
  heroVideo: z.string().optional(),
});

export const appCustomSchemesReadSchema = z.union([
  z.array(appColorSchemeSchema),
  // Legacy: JSON-encoded string
  z.string().transform((str, ctx) => {
    if (!str.trim()) return [];
    try {
      const parsed = JSON.parse(str);
      if (!Array.isArray(parsed)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Expected array" });
        return z.NEVER;
      }
      return parsed;
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid JSON" });
      return z.NEVER;
    }
  }),
]);

export const appCustomSchemesWriteSchema = z.array(appColorSchemeSchema);

const terminalColorSchemeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["dark", "light"]),
  builtin: z.boolean(),
  colors: z.record(z.string(), z.string()),
  location: z.string().optional(),
});

export const terminalCustomSchemesReadSchema = z.union([
  z.array(terminalColorSchemeSchema),
  z.string().transform((str, ctx) => {
    if (!str.trim()) return [];
    try {
      const parsed = JSON.parse(str);
      if (!Array.isArray(parsed)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Expected array" });
        return z.NEVER;
      }
      return parsed;
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid JSON" });
      return z.NEVER;
    }
  }),
]);

export const terminalCustomSchemesWriteSchema = z.array(terminalColorSchemeSchema);

export interface CustomSchemesMigrationResult<T> {
  schemes: T[];
  /** Entries that failed validation and were dropped */
  droppedCount: number;
  /** Human-readable parse/validation errors */
  errors: string[];
  /** Whether the store value was rewritten (migrated or pruned) */
  migrated: boolean;
}

/**
 * Parses a legacy string or native array into a validated scheme array.
 * Returns successfully parsed schemes plus diagnostics for failures.
 */
export function migrateCustomSchemes<T>(
  raw: unknown,
  readSchema: z.ZodType<T[], z.ZodTypeDef, unknown>,
  writeSchema: z.ZodType<T[], z.ZodTypeDef, T[]>
): CustomSchemesMigrationResult<T> {
  const errors: string[] = [];

  // Step 1: coerce legacy string to array
  const readResult = readSchema.safeParse(raw);
  if (!readResult.success) {
    return { schemes: [], droppedCount: 0, errors: [readResult.error.message], migrated: false };
  }

  const candidates: unknown[] = readResult.data as unknown[];
  const valid: T[] = [];
  let droppedCount = 0;

  // Step 2: validate each entry with strict schema
  for (let i = 0; i < candidates.length; i++) {
    const result = writeSchema.element.safeParse(candidates[i]);
    if (result.success) {
      valid.push(result.data);
    } else {
      droppedCount++;
      const id =
        typeof (candidates[i] as Record<string, unknown>)?.id === "string"
          ? (candidates[i] as Record<string, unknown>).id
          : `index-${i}`;
      errors.push(`Dropped invalid custom scheme "${id}": ${result.error.message}`);
      console.warn(`[customSchemes] ${errors[errors.length - 1]}`);
    }
  }

  // Migration happened if we parsed a string or pruned invalid entries
  const migrated = typeof raw === "string" || droppedCount > 0;

  return { schemes: valid, droppedCount, errors, migrated };
}
