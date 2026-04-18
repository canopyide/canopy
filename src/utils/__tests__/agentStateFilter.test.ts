import { describe, it, expect } from "vitest";
import { matchesDeckFilter } from "../agentStateFilter";

describe("matchesDeckFilter", () => {
  it("all matches every state including null", () => {
    expect(matchesDeckFilter(null, "all")).toBe(true);
    expect(matchesDeckFilter("idle", "all")).toBe(true);
    expect(matchesDeckFilter("working", "all")).toBe(true);
    expect(matchesDeckFilter("completed", "all")).toBe(true);
  });

  it("waiting matches waiting and directing", () => {
    expect(matchesDeckFilter("waiting", "waiting")).toBe(true);
    expect(matchesDeckFilter("directing", "waiting")).toBe(true);
    expect(matchesDeckFilter("working", "waiting")).toBe(false);
  });

  it("working matches working and running", () => {
    expect(matchesDeckFilter("working", "working")).toBe(true);
    expect(matchesDeckFilter("running", "working")).toBe(true);
    expect(matchesDeckFilter("idle", "working")).toBe(false);
  });

  it("idle matches idle and null/undefined state", () => {
    expect(matchesDeckFilter("idle", "idle")).toBe(true);
    expect(matchesDeckFilter(null, "idle")).toBe(true);
    expect(matchesDeckFilter(undefined, "idle")).toBe(true);
    expect(matchesDeckFilter("working", "idle")).toBe(false);
  });

  it("completed matches completed", () => {
    expect(matchesDeckFilter("completed", "completed")).toBe(true);
    expect(matchesDeckFilter("exited", "completed")).toBe(false);
  });

  it("failed matches exited", () => {
    expect(matchesDeckFilter("exited", "failed")).toBe(true);
    expect(matchesDeckFilter("completed", "failed")).toBe(false);
  });
});
