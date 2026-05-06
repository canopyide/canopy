import { describe, expect, it } from "vitest";
import { AgentActivityTemperature } from "../AgentActivityTemperature.js";
import { createVisibleContentSnapshot } from "../SustainedChangeTracker.js";

function snapshot(text: string) {
  return createVisibleContentSnapshot([text]);
}

describe("AgentActivityTemperature", () => {
  it("requires sustained visible changes before hinting busy", () => {
    const model = new AgentActivityTemperature();

    model.seedSnapshot(snapshot("waiting 0"), 1000);

    expect(model.observeSnapshot(1100, snapshot("tick 1")).stateHint).toBeUndefined();
    expect(model.observeSnapshot(1800, snapshot("tick 2")).stateHint).toBeUndefined();
    expect(model.observeSnapshot(2500, snapshot("tick 3")).stateHint).toBeUndefined();

    const result = model.observeSnapshot(3200, snapshot("tick 4"));
    expect(result.stateHint).toBe("busy");
    expect(result.temperature).toBeGreaterThanOrEqual(70);
  });

  it("does not hint busy for a fast burst that has not met working dwell", () => {
    const model = new AgentActivityTemperature();

    model.seedSnapshot(snapshot("waiting 0"), 1000);

    expect(model.observeSnapshot(1050, snapshot("tick 1")).stateHint).toBeUndefined();
    expect(model.observeSnapshot(1150, snapshot("tick 2")).stateHint).toBeUndefined();
    expect(model.observeSnapshot(1250, snapshot("tick 3")).stateHint).toBeUndefined();
    expect(model.observeSnapshot(1350, snapshot("tick 4")).stateHint).toBeUndefined();
    expect(model.getTemperature()).toBeGreaterThanOrEqual(70);
  });

  it("cools through the waiting threshold only after six-second quiet dwell", () => {
    const model = new AgentActivityTemperature();

    model.seedSnapshot(snapshot("waiting 0"), 1000);
    model.observeSnapshot(1100, snapshot("working 1"));
    model.observeSnapshot(1800, snapshot("working 2"));
    model.observeSnapshot(2500, snapshot("working 3"));
    expect(model.observeSnapshot(3200, snapshot("working 4")).stateHint).toBe("busy");

    expect(model.observeSnapshot(3300, snapshot("working 4")).stateHint).toBeUndefined();
    expect(model.observeSnapshot(8000, snapshot("working 4")).stateHint).toBeUndefined();
    expect(model.observeSnapshot(9300, snapshot("working 4")).stateHint).toBe("idle");
    expect(model.getTemperature()).toBeLessThanOrEqual(40);
  });

  it("treats resize as dead-time and baseline-only reseed", () => {
    const model = new AgentActivityTemperature();

    model.seedSnapshot(snapshot("waiting 0"), 1000);
    model.observeSnapshot(1100, snapshot("working 1"));
    model.observeSnapshot(1800, snapshot("working 2"));

    model.noteResize(1900);

    const suppressed = model.observeSnapshot(2400, snapshot("reflowed content"));
    expect(suppressed.suppressed).toBe(true);
    expect(suppressed.stateHint).toBeUndefined();

    const seeded = model.observeSnapshot(3000, snapshot("post resize baseline"));
    expect(seeded.seeded).toBe(true);
    expect(seeded.stateHint).toBeUndefined();

    expect(model.observeSnapshot(3700, snapshot("post resize 1")).stateHint).toBeUndefined();
    expect(model.observeSnapshot(4400, snapshot("post resize 2")).stateHint).toBeUndefined();
    expect(model.observeSnapshot(5100, snapshot("post resize 3")).stateHint).toBeUndefined();
    expect(model.observeSnapshot(5800, snapshot("post resize 4")).stateHint).toBe("busy");
  });

  it("caps resize blindness during continuous resize", () => {
    const model = new AgentActivityTemperature();

    model.seedSnapshot(snapshot("waiting 0"), 1000);
    model.noteResize(1500);
    model.noteResize(2300);
    model.noteResize(3100);

    const result = model.observeSnapshot(3500, snapshot("baseline after long resize"));
    expect(result.seeded).toBe(true);
    expect(result.suppressed).toBe(false);
  });

  it("keeps decorative spinner heat below the working threshold", () => {
    const model = new AgentActivityTemperature();

    for (let i = 0; i < 20; i += 1) {
      const result = model.observeDelta(1000 + i * 250, {
        changedChars: 1,
        decorative: true,
      });
      expect(result.stateHint).toBeUndefined();
    }

    expect(model.getTemperature()).toBeLessThan(70);
  });
});
