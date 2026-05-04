import type { BuiltInAgentId } from "../../../shared/config/agentIds.js";
import { AGENT_REGISTRY } from "../../../shared/config/agentRegistry.js";

function packageTail(pkg: string | undefined): string | undefined {
  if (!pkg) return undefined;
  const tail = pkg.split("/").pop();
  return tail && tail.length > 0 ? tail : undefined;
}

/** Reads `packages.npm` first; falls back to deprecated top-level `npmGlobalPackage`. */
function effectiveNpmPackage(config: {
  packages?: { npm?: string };
  npmGlobalPackage?: string;
}): string | undefined {
  return config.packages?.npm ?? config.npmGlobalPackage;
}

export const AGENT_CLI_NAMES: Record<string, BuiltInAgentId> = Object.fromEntries(
  Object.entries(AGENT_REGISTRY).flatMap(([id, config]) => {
    const entries: [string, BuiltInAgentId][] = [[config.command, id as BuiltInAgentId]];
    if (config.command !== id) {
      entries.push([id, id as BuiltInAgentId]);
    }
    const tail = packageTail(effectiveNpmPackage(config));
    if (tail && tail !== config.command && tail !== id) {
      entries.push([tail, id as BuiltInAgentId]);
    }
    return entries;
  })
);

export const PROCESS_ICON_MAP: Record<string, string> = {
  // AI agents (derived from registry)
  ...Object.fromEntries(
    Object.entries(AGENT_REGISTRY).flatMap(([id, config]) => {
      const entries: [string, string][] = [[id, config.iconId]];
      if (config.command !== id) {
        entries.push([config.command, config.iconId]);
      }
      const tail = packageTail(effectiveNpmPackage(config));
      if (tail && tail !== config.command && tail !== id) {
        entries.push([tail, config.iconId]);
      }
      return entries;
    })
  ),
  // Package managers
  npm: "npm",
  npx: "npm",
  yarn: "yarn",
  pnpm: "pnpm",
  bun: "bun",
  composer: "composer",
  // Language runtimes
  python: "python",
  python3: "python",
  node: "node",
  deno: "deno",
  ruby: "ruby",
  rails: "ruby",
  bundle: "ruby",
  go: "go",
  cargo: "rust",
  rustc: "rust",
  php: "php",
  kotlin: "kotlin",
  kotlinc: "kotlin",
  swift: "swift",
  swiftc: "swift",
  elixir: "elixir",
  mix: "elixir",
  iex: "elixir",
  // Build tools
  gradle: "gradle",
  gradlew: "gradle",
  webpack: "webpack",
  vite: "vite",
  // Infrastructure
  docker: "docker",
  terraform: "terraform",
  tofu: "terraform",
};

export const PACKAGE_MANAGER_ICON_IDS = new Set(["npm", "yarn", "pnpm", "bun", "composer"]);
