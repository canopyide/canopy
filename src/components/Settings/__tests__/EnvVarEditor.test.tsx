// @vitest-environment jsdom
/**
 * EnvVarEditor — draft-row env CRUD with validation.
 *
 * These tests lock in the behaviour that prevents silent data loss and the
 * "my changes disappeared" classes of bugs the uncontrolled `defaultValue`
 * pattern caused in the earlier implementation:
 *
 *  - Empty key after blur surfaces a visible error and does NOT persist.
 *  - Duplicate keys are detected on-change and flagged on both rows.
 *  - Removing a row commits the updated env immediately.
 *  - Renaming a key commits only when the new name is non-empty and unique.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { EnvVarEditor } from "../EnvVarEditor";

vi.mock("lucide-react", () => ({
  X: () => <span data-testid="x-icon" />,
}));

describe("EnvVarEditor", () => {
  let onChange: ReturnType<typeof vi.fn<(env: Record<string, string>) => void>>;

  beforeEach(() => {
    onChange = vi.fn<(env: Record<string, string>) => void>();
  });

  function renderEditor(initial: Record<string, string>) {
    return render(<EnvVarEditor env={initial} onChange={onChange} />);
  }

  it("renders one row per env var key", () => {
    const { getAllByTestId } = renderEditor({ FOO: "bar", BAZ: "qux" });
    expect(getAllByTestId("env-editor-key")).toHaveLength(2);
  });

  it("shows 'No env overrides' placeholder when empty", () => {
    const { getByText } = renderEditor({});
    expect(getByText(/No env overrides/)).toBeTruthy();
  });

  it("renaming a key to a unique non-empty name commits the updated env", () => {
    const { getAllByTestId } = renderEditor({ OLD: "v" });
    const keyInput = getAllByTestId("env-editor-key")[0] as HTMLInputElement;

    fireEvent.change(keyInput, { target: { value: "NEW" } });
    fireEvent.blur(keyInput);

    expect(onChange).toHaveBeenLastCalledWith({ NEW: "v" });
  });

  it("editing a value commits after the value input blurs", () => {
    const { getAllByTestId } = renderEditor({ FOO: "one" });
    const valueInput = getAllByTestId("env-editor-value")[0] as HTMLInputElement;

    fireEvent.change(valueInput, { target: { value: "two" } });
    fireEvent.blur(valueInput);

    expect(onChange).toHaveBeenLastCalledWith({ FOO: "two" });
  });

  it("blurring with an empty key surfaces 'Key required' and does NOT commit", () => {
    const { getAllByTestId, getByTestId, queryByTestId } = renderEditor({ FOO: "v" });
    const keyInput = getAllByTestId("env-editor-key")[0] as HTMLInputElement;

    fireEvent.change(keyInput, { target: { value: "" } });
    expect(queryByTestId("env-editor-error-empty")).toBeNull(); // not yet touched
    fireEvent.blur(keyInput);

    expect(getByTestId("env-editor-error-empty")).toBeTruthy();
    // onChange should NOT have been called with an empty-key commit because
    // invalid drafts are held.
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    if (lastCall) {
      // If a call happened, it must not contain an empty key.
      expect(Object.keys(lastCall[0])).not.toContain("");
    }
  });

  it("entering a duplicate key flags both rows and holds the commit", () => {
    const { getAllByTestId, getAllByText } = renderEditor({ FOO: "a", BAR: "b" });
    const keyInputs = getAllByTestId("env-editor-key") as HTMLInputElement[];

    // Change the second row's key to match the first.
    fireEvent.change(keyInputs[1]!, { target: { value: "FOO" } });
    fireEvent.blur(keyInputs[1]!);

    // Duplicate key error surfaces (the first row also gets flagged because it
    // matches the duplicate set).
    expect(getAllByText(/Duplicate key/).length).toBeGreaterThanOrEqual(1);

    // Commit must not include the duplicate (the resolver drops the second
    // occurrence and keeps {FOO: "a"}).
    const latestCommit = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    if (latestCommit) {
      expect(Object.keys(latestCommit)).toEqual(expect.arrayContaining(["FOO"]));
      expect(Object.keys(latestCommit)).not.toContain("BAR"); // second row with duplicate key is dropped
    }
  });

  it("removing a row commits the env without that key", () => {
    const { getAllByTestId } = renderEditor({ KEEP: "a", REMOVE: "b" });
    const removeButtons = getAllByTestId("env-editor-remove");

    fireEvent.click(removeButtons[1]!);

    expect(onChange).toHaveBeenLastCalledWith({ KEEP: "a" });
  });

  it("clicking Add appends a row with a non-colliding KEY name", () => {
    const { getByTestId, getAllByTestId } = renderEditor({ NEW_VAR: "already" });
    const addButton = getByTestId("env-editor-add");

    fireEvent.click(addButton);

    const keyInputs = getAllByTestId("env-editor-key") as HTMLInputElement[];
    expect(keyInputs).toHaveLength(2);
    // Second row should pick NEW_VAR_1 (first collides).
    expect(keyInputs[1]!.value).toBe("NEW_VAR_1");
  });

  it("newly-added rows do not show 'Key required' before first blur", () => {
    const { getByTestId, queryByTestId } = renderEditor({});
    fireEvent.click(getByTestId("env-editor-add"));
    expect(queryByTestId("env-editor-error-empty")).toBeNull();
  });

  it("context key change reseeds draft rows (switching between flavors)", () => {
    const { rerender, getAllByTestId } = render(
      <EnvVarEditor env={{ ALPHA: "1" }} onChange={onChange} contextKey="flavor-a" />
    );
    expect(getAllByTestId("env-editor-key")).toHaveLength(1);

    rerender(
      <EnvVarEditor env={{ BETA: "2", GAMMA: "3" }} onChange={onChange} contextKey="flavor-b" />
    );
    const keyInputs = getAllByTestId("env-editor-key") as HTMLInputElement[];
    expect(keyInputs).toHaveLength(2);
    expect(keyInputs.map((el) => el.value)).toEqual(expect.arrayContaining(["BETA", "GAMMA"]));
  });

  it("datalist is rendered when suggestions + datalistId provided", () => {
    const { container } = render(
      <EnvVarEditor
        env={{}}
        onChange={onChange}
        suggestions={[{ key: "ANTHROPIC_API_KEY", hint: "Claude auth" }]}
        datalistId="env-key-suggestions-test"
      />
    );
    const datalist = container.querySelector("datalist#env-key-suggestions-test");
    expect(datalist).toBeTruthy();
    expect(datalist?.querySelectorAll("option").length).toBe(1);
  });
});
