import type {
  AgentConfig,
  AgentInstallBlock,
  AgentInstallOS,
} from "../../shared/config/agentRegistry";

export function detectOS(): AgentInstallOS {
  if (typeof navigator === "undefined" || !navigator.platform) {
    return "generic";
  }
  const platform = navigator.platform.toUpperCase();
  if (platform.includes("MAC")) {
    return "macos";
  }
  if (platform.includes("WIN")) {
    return "windows";
  }
  if (platform.includes("LINUX")) {
    return "linux";
  }
  return "generic";
}

export function getInstallBlocksForCurrentOS(agent: AgentConfig): AgentInstallBlock[] | null {
  if (!agent.install?.byOs) {
    return null;
  }

  const currentOS = detectOS();
  const blocks = agent.install.byOs[currentOS];

  if (blocks && blocks.length > 0) {
    return blocks;
  }

  const genericBlocks = agent.install.byOs.generic;
  if (genericBlocks && genericBlocks.length > 0) {
    return genericBlocks;
  }

  return null;
}
