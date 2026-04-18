// @vitest-environment node
import { describe, it, expect } from "vitest";
import { serializePtyPanel } from "../serializer";
import type { PtyPanelData } from "@shared/types/panel";

function makePanel(overrides: Partial<PtyPanelData> = {}): PtyPanelData {
  return {
    id: "p1",
    title: "Claude",
    kind: "agent",
    type: "claude",
    agentId: "claude",
    cwd: "/project",
    location: "grid",
    ...overrides,
  } as PtyPanelData;
}

describe("serializePtyPanel — agentFlavorId", () => {
  it("includes agentFlavorId in the snapshot when set", () => {
    const panel = makePanel({ agentFlavorId: "user-abc123" });
    const snapshot = serializePtyPanel(panel);
    expect(snapshot.agentFlavorId).toBe("user-abc123");
  });

  it("includes CCR flavor IDs as well as custom ones", () => {
    const panel = makePanel({ agentFlavorId: "ccr-some-route" });
    const snapshot = serializePtyPanel(panel);
    expect(snapshot.agentFlavorId).toBe("ccr-some-route");
  });

  it("omits agentFlavorId when it is undefined", () => {
    const panel = makePanel({ agentFlavorId: undefined });
    const snapshot = serializePtyPanel(panel);
    expect("agentFlavorId" in snapshot).toBe(false);
  });

  it("omits agentFlavorId when it is an empty string", () => {
    const panel = makePanel({ agentFlavorId: "" });
    const snapshot = serializePtyPanel(panel);
    expect("agentFlavorId" in snapshot).toBe(false);
  });
});

describe("serializePtyPanel — other fields are unaffected by agentFlavorId", () => {
  it("still serializes agentSessionId alongside agentFlavorId", () => {
    const panel = makePanel({
      agentFlavorId: "user-xyz",
      agentSessionId: "sess-999",
    });
    const snapshot = serializePtyPanel(panel);
    expect(snapshot.agentFlavorId).toBe("user-xyz");
    expect(snapshot.agentSessionId).toBe("sess-999");
  });

  it("still serializes agentModelId alongside agentFlavorId", () => {
    const panel = makePanel({
      agentFlavorId: "user-xyz",
      agentModelId: "claude-sonnet-4-6",
    });
    const snapshot = serializePtyPanel(panel);
    expect(snapshot.agentFlavorId).toBe("user-xyz");
    expect(snapshot.agentModelId).toBe("claude-sonnet-4-6");
  });

  it("still serializes agentLaunchFlags alongside agentFlavorId", () => {
    const panel = makePanel({
      agentFlavorId: "user-xyz",
      agentLaunchFlags: ["--dangerously-skip-permissions"],
    });
    const snapshot = serializePtyPanel(panel);
    expect(snapshot.agentFlavorId).toBe("user-xyz");
    expect(snapshot.agentLaunchFlags).toEqual(["--dangerously-skip-permissions"]);
  });
});

// ── adversarial: agentFlavorColor must survive the serialise/restore round-trip ─
// Bug: serializePtyPanel does not write agentFlavorColor into the snapshot.
// After an Electron reload the panel re-opens with agentFlavorColor=undefined,
// so the dock icon loses its tint and falls back to the vanilla brand color —
// even when the flavor is still present in settings.

describe("serializePtyPanel — agentFlavorColor (Bug: not serialized)", () => {
  it("includes agentFlavorColor in the snapshot when set", () => {
    const panel = makePanel({ agentFlavorColor: "#ff6600" });
    const snapshot = serializePtyPanel(panel);
    expect(snapshot.agentFlavorColor).toBe("#ff6600");
  });

  it("omits agentFlavorColor when it is undefined", () => {
    const panel = makePanel({ agentFlavorColor: undefined });
    const snapshot = serializePtyPanel(panel);
    expect("agentFlavorColor" in snapshot).toBe(false);
  });

  it("serializes both agentFlavorId and agentFlavorColor together", () => {
    const panel = makePanel({ agentFlavorId: "user-abc", agentFlavorColor: "#aabbcc" });
    const snapshot = serializePtyPanel(panel);
    expect(snapshot.agentFlavorId).toBe("user-abc");
    expect(snapshot.agentFlavorColor).toBe("#aabbcc");
  });
});
