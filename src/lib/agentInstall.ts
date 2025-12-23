import type {
  AgentInstallOS,
  AgentInstallBlock,
  AgentInstallHelp,
} from "../../shared/config/agentRegistry";

export function detectOS(): AgentInstallOS {
  if (!navigator.platform || typeof navigator.platform !== "string") {
    return "generic";
  }
  const platform = navigator.platform.toUpperCase();
  if (platform.includes("MAC")) return "macos";
  if (platform.includes("WIN")) return "windows";
  if (platform.includes("LINUX")) return "linux";
  return "generic";
}

export function getInstallBlocksForOS(
  install: AgentInstallHelp | undefined,
  os: AgentInstallOS
): AgentInstallBlock[] {
  if (!install?.byOs) return [];

  const blocks = install.byOs[os];
  if (blocks && blocks.length > 0) return blocks;

  const genericBlocks = install.byOs.generic;
  if (genericBlocks && genericBlocks.length > 0) return genericBlocks;

  return [];
}
