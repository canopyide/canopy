import { describe, expect, it } from "vitest";
import { getScenarioBudget, loadBudgetConfig } from "../lib/budgets";

describe("perf budgets", () => {
  it("loads budget config with critical scenarios", () => {
    const config = loadBudgetConfig();
    expect(config.criticalScenarios).toContain("PERF-001");
    expect(config.criticalScenarios).toContain("PERF-011");
    expect(config.criticalScenarios).toContain("PERF-020");
  });

  it("merges default and scenario-specific budgets", () => {
    const config = loadBudgetConfig();
    const scenarioBudget = getScenarioBudget(config, "PERF-042");
    const fallbackBudget = getScenarioBudget(config, "PERF-999");

    expect(scenarioBudget.p95Ms).toBeTypeOf("number");
    expect(scenarioBudget.maxMetricValues?.eventLoopLagMs).toBe(100);
    expect(fallbackBudget.maxRegressionPct).toBe(config.defaultBudget.maxRegressionPct);
  });
});
