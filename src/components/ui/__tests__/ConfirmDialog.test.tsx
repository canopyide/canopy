// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "../ConfirmDialog";

vi.mock("zustand/react/shallow", () => ({
  useShallow: (fn: unknown) => fn,
}));

vi.mock("@/store", () => ({
  usePortalStore: () => ({ isOpen: false, width: 0 }),
}));

vi.mock("@/hooks", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useOverlayState: () => {},
  };
});

vi.mock("@/hooks/useAnimatedPresence", () => ({
  useAnimatedPresence: ({ isOpen }: { isOpen: boolean }) => ({
    isVisible: isOpen,
    shouldRender: isOpen,
  }),
}));

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

describe("ConfirmDialog destructive-label dev guard", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  });

  afterEach(() => {
    errorSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("warns when confirmLabel looks destructive but variant is default", () => {
    render(
      <ConfirmDialog
        isOpen={true}
        onClose={() => {}}
        title="Delete it?"
        confirmLabel="Delete worktree"
        onConfirm={() => {}}
        variant="default"
      />
    );

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toContain("[ConfirmDialog]");
    expect(errorSpy.mock.calls[0]?.[0]).toContain("Delete worktree");
    expect(errorSpy.mock.calls[0]?.[0]).toContain('variant="default"');
  });

  it("is silent when variant is destructive", () => {
    render(
      <ConfirmDialog
        isOpen={true}
        onClose={() => {}}
        title="Delete it?"
        confirmLabel="Delete worktree"
        onConfirm={() => {}}
        variant="destructive"
      />
    );

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("is silent when label does not look destructive", () => {
    render(
      <ConfirmDialog
        isOpen={true}
        onClose={() => {}}
        title="Save?"
        confirmLabel="Save changes"
        onConfirm={() => {}}
        variant="default"
      />
    );

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("matches case-insensitively and tolerates leading whitespace", () => {
    render(
      <ConfirmDialog
        isOpen={true}
        onClose={() => {}}
        title="Remove?"
        confirmLabel="REMOVE recipe"
        onConfirm={() => {}}
        variant="default"
      />
    );

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("is silent in production builds", () => {
    vi.stubEnv("DEV", false);

    render(
      <ConfirmDialog
        isOpen={true}
        onClose={() => {}}
        title="Delete it?"
        confirmLabel="Delete worktree"
        onConfirm={() => {}}
        variant="default"
      />
    );

    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("ConfirmDialog — typed-name gate", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  });

  afterEach(() => {
    cleanup();
    errorSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  function findConfirmButton() {
    const buttons = Array.from(document.querySelectorAll("button")) as HTMLButtonElement[];
    const button = buttons.find((b) => b.textContent?.trim() === "Delete it");
    if (!button) throw new Error("Confirm button not found");
    return button;
  }

  function findTypedInput() {
    const input = screen.getByLabelText(/^Type .* to confirm$/i) as HTMLInputElement;
    return input;
  }

  it("renders the typed-name input and disables confirm until exact match", () => {
    render(
      <ConfirmDialog
        isOpen={true}
        onClose={() => {}}
        title="Delete repo?"
        confirmLabel="Delete it"
        onConfirm={() => {}}
        variant="destructive"
        typedNameTarget="my-repo"
      />
    );

    const input = findTypedInput();
    const button = findConfirmButton();

    expect(input).toBeDefined();
    expect(button.disabled).toBe(true);

    fireEvent.change(input, { target: { value: "my-rep" } });
    expect(button.disabled).toBe(true);

    fireEvent.change(input, { target: { value: "My-Repo" } });
    expect(button.disabled).toBe(true);

    fireEvent.change(input, { target: { value: "my-repo" } });
    expect(button.disabled).toBe(false);
  });

  it("does not call onConfirm when primary action is invoked while unmatched", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        isOpen={true}
        onClose={() => {}}
        title="Delete repo?"
        confirmLabel="Delete it"
        onConfirm={onConfirm}
        variant="destructive"
        typedNameTarget="my-repo"
      />
    );

    const input = findTypedInput();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("submits on Enter when the typed value matches", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        isOpen={true}
        onClose={() => {}}
        title="Delete repo?"
        confirmLabel="Delete it"
        onConfirm={onConfirm}
        variant="destructive"
        typedNameTarget="my-repo"
      />
    );

    const input = findTypedInput();
    fireEvent.change(input, { target: { value: "my-repo" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("resets the typed value when the dialog closes and reopens", () => {
    const { rerender } = render(
      <ConfirmDialog
        isOpen={true}
        onClose={() => {}}
        title="Delete repo?"
        confirmLabel="Delete it"
        onConfirm={() => {}}
        variant="destructive"
        typedNameTarget="my-repo"
      />
    );

    const input = findTypedInput();
    fireEvent.change(input, { target: { value: "my-repo" } });
    expect(findConfirmButton().disabled).toBe(false);

    rerender(
      <ConfirmDialog
        isOpen={false}
        onClose={() => {}}
        title="Delete repo?"
        confirmLabel="Delete it"
        onConfirm={() => {}}
        variant="destructive"
        typedNameTarget="my-repo"
      />
    );
    rerender(
      <ConfirmDialog
        isOpen={true}
        onClose={() => {}}
        title="Delete repo?"
        confirmLabel="Delete it"
        onConfirm={() => {}}
        variant="destructive"
        typedNameTarget="my-repo"
      />
    );

    const reopenedInput = findTypedInput();
    expect(reopenedInput.value).toBe("");
    expect(findConfirmButton().disabled).toBe(true);
  });

  it("does not render the input or gate the button when typedNameTarget is empty", () => {
    render(
      <ConfirmDialog
        isOpen={true}
        onClose={() => {}}
        title="Delete repo?"
        confirmLabel="Delete it"
        onConfirm={() => {}}
        variant="destructive"
        typedNameTarget=""
      />
    );

    expect(screen.queryByLabelText(/^Type .* to confirm$/i)).toBeNull();
    expect(findConfirmButton().disabled).toBe(false);
  });

  it("warns in dev when typedNameTarget is set with a non-destructive variant", () => {
    render(
      <ConfirmDialog
        isOpen={true}
        onClose={() => {}}
        title="Confirm?"
        confirmLabel="Continue"
        onConfirm={() => {}}
        variant="default"
        typedNameTarget="thing"
      />
    );

    expect(errorSpy).toHaveBeenCalled();
    const message = errorSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(message).toContain("typedNameTarget");
    expect(message).toContain('variant="default"');
  });

  it("is silent for typedNameTarget on a destructive variant", () => {
    render(
      <ConfirmDialog
        isOpen={true}
        onClose={() => {}}
        title="Delete it?"
        confirmLabel="Delete it"
        onConfirm={() => {}}
        variant="destructive"
        typedNameTarget="thing"
      />
    );

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("does not warn in production builds", () => {
    vi.stubEnv("DEV", false);

    render(
      <ConfirmDialog
        isOpen={true}
        onClose={() => {}}
        title="Confirm?"
        confirmLabel="Continue"
        onConfirm={() => {}}
        variant="default"
        typedNameTarget="thing"
      />
    );

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
