import type { BuiltInAgentId } from "../../../shared/config/agentIds.js";
import type { DetectedProcessCandidate } from "./types.js";
import { AGENT_CLI_NAMES, PROCESS_ICON_MAP, PACKAGE_MANAGER_ICON_IDS } from "./registries.js";
import { extractCommandNameCandidates } from "./commandParser.js";

export function normalizeProcessName(name: string): string {
  const basename = name.split(/[\\/]/).pop() || name;
  return basename.replace(/\.exe$/i, "");
}

export function getDetectionPriority(agentType?: BuiltInAgentId, processIconId?: string): number {
  if (agentType) {
    return 0;
  }

  if (processIconId && PACKAGE_MANAGER_ICON_IDS.has(processIconId)) {
    return 1;
  }

  return 2;
}

export function buildDetectedCandidate(
  processName: string,
  processCommand: string | undefined,
  order: number
): DetectedProcessCandidate | null {
  const normalizedName = normalizeProcessName(processName);
  const lowerName = normalizedName.toLowerCase();

  let agentType = AGENT_CLI_NAMES[lowerName];
  let processIconId = PROCESS_ICON_MAP[lowerName];
  let effectiveName = normalizedName;

  if (!agentType && processCommand) {
    const candidates = extractCommandNameCandidates(processCommand);
    let iconMatch: { name: string; icon: string } | null = null;
    for (const candidate of candidates) {
      const lowerCandidate = candidate.toLowerCase();
      const candidateAgent = AGENT_CLI_NAMES[lowerCandidate];
      if (candidateAgent) {
        agentType = candidateAgent;
        processIconId = PROCESS_ICON_MAP[lowerCandidate] ?? processIconId;
        effectiveName = candidate;
        break;
      }
      if (!iconMatch) {
        const candidateIcon = PROCESS_ICON_MAP[lowerCandidate];
        if (candidateIcon) iconMatch = { name: candidate, icon: candidateIcon };
      }
    }
    if (!agentType && !processIconId && iconMatch) {
      processIconId = iconMatch.icon;
      effectiveName = iconMatch.name;
    }
  }

  if (!agentType && !processIconId) {
    return null;
  }

  return {
    agentType,
    processIconId,
    processName: effectiveName,
    processCommand,
    priority: getDetectionPriority(agentType, processIconId),
    order,
  };
}

export function selectPreferredCandidate(
  current: DetectedProcessCandidate | null,
  candidate: DetectedProcessCandidate
): DetectedProcessCandidate {
  if (!current) {
    return candidate;
  }

  if (candidate.priority < current.priority) {
    return candidate;
  }

  if (candidate.priority === current.priority && candidate.order < current.order) {
    return candidate;
  }

  return current;
}
