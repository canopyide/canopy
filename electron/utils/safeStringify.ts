import { configure } from "safe-stable-stringify";

const stringify = configure({ bigint: false });

function replacer(_key: string, val: unknown): unknown {
  if (typeof val === "bigint") return val.toString();
  if (typeof val === "symbol") return val.toString();
  if (typeof val === "function") return `[Function: ${val.name || "anonymous"}]`;
  if (val instanceof Error) return { name: val.name, message: val.message, stack: val.stack };
  return val;
}

export function safeStringify(value: unknown, space?: string | number): string {
  if (value === undefined) return undefined as unknown as string;

  try {
    return stringify(value, replacer, space);
  } catch {
    try {
      return String(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }
}
