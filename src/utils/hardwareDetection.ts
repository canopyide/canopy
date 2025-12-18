export type GpuTier = "low" | "medium" | "high";

export interface HardwareProfile {
  cpuCores: number;
  estimatedGpuTier: GpuTier;
  baseWebGLBudget: number;
}

const BUDGET_BY_TIER: Record<GpuTier, number> = {
  low: 4,
  medium: 8,
  high: 12,
};

export function detectHardware(): HardwareProfile {
  // navigator.hardwareConcurrency may be unavailable in some contexts
  const rawCores =
    typeof navigator !== "undefined" &&
    typeof navigator.hardwareConcurrency === "number" &&
    navigator.hardwareConcurrency > 0
      ? navigator.hardwareConcurrency
      : 4;

  const cpuCores = Math.max(1, rawCores);

  // GPU tier heuristic based on CPU cores
  // Conservative: assumes integrated GPU scales with CPU
  let estimatedGpuTier: GpuTier;
  if (cpuCores <= 4) {
    estimatedGpuTier = "low";
  } else if (cpuCores <= 8) {
    estimatedGpuTier = "medium";
  } else {
    estimatedGpuTier = "high";
  }

  return {
    cpuCores,
    estimatedGpuTier,
    baseWebGLBudget: BUDGET_BY_TIER[estimatedGpuTier],
  };
}
