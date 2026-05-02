import { describe, it, expect, beforeEach } from "vitest";
import { useFleetPickerSessionStore } from "../fleetPickerSessionStore";

function reset() {
  useFleetPickerSessionStore.setState({ activeOwner: null });
}

describe("fleetPickerSessionStore", () => {
  beforeEach(reset);

  it("acquires when no owner holds the session", () => {
    const ok = useFleetPickerSessionStore.getState().acquire("cold-start");
    expect(ok).toBe(true);
    expect(useFleetPickerSessionStore.getState().activeOwner).toBe("cold-start");
  });

  it("rejects acquire from a different owner while held", () => {
    useFleetPickerSessionStore.getState().acquire("cold-start");
    const ok = useFleetPickerSessionStore.getState().acquire("ribbon-add");
    expect(ok).toBe(false);
    expect(useFleetPickerSessionStore.getState().activeOwner).toBe("cold-start");
  });

  it("is idempotent for the same owner reacquiring", () => {
    useFleetPickerSessionStore.getState().acquire("ribbon-add");
    const ok = useFleetPickerSessionStore.getState().acquire("ribbon-add");
    expect(ok).toBe(true);
    expect(useFleetPickerSessionStore.getState().activeOwner).toBe("ribbon-add");
  });

  it("release by the holding owner clears the session", () => {
    useFleetPickerSessionStore.getState().acquire("cold-start");
    useFleetPickerSessionStore.getState().release("cold-start");
    expect(useFleetPickerSessionStore.getState().activeOwner).toBeNull();
  });

  it("release by a non-holding owner is a no-op (safe stale unmount)", () => {
    useFleetPickerSessionStore.getState().acquire("cold-start");
    useFleetPickerSessionStore.getState().release("ribbon-add");
    expect(useFleetPickerSessionStore.getState().activeOwner).toBe("cold-start");
  });

  it("release when no owner holds is a no-op", () => {
    useFleetPickerSessionStore.getState().release("cold-start");
    expect(useFleetPickerSessionStore.getState().activeOwner).toBeNull();
  });
});
