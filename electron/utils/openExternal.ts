import { shell } from "electron";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export async function openExternalUrl(url: string): Promise<void> {
  console.log("[openExternal] Received URL:", url);
  const parsed = new URL(url);

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Protocol ${parsed.protocol} is not allowed`);
  }

  console.log("[openExternal] Calling shell.openExternal for:", parsed.toString());
  await shell.openExternal(parsed.toString(), { activate: true });
  console.log("[openExternal] shell.openExternal completed");
}
