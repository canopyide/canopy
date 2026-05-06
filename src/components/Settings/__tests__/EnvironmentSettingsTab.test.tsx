// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EnvironmentSettingsTab } from "../EnvironmentSettingsTab";
import { SettingsValidationProvider } from "../SettingsValidationRegistry";

vi.mock("@/lib/notify", () => ({
  notify: vi.fn(),
}));

vi.mock("@/utils/logger", () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
  logDebug: vi.fn(),
}));

import { notify } from "@/lib/notify";
import { logError } from "@/utils/logger";

beforeEach(() => {
  vi.clearAllMocks();
  window.electron = {
    globalEnv: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as typeof window.electron;
});

function renderTab() {
  return render(
    <SettingsValidationProvider>
      <EnvironmentSettingsTab />
    </SettingsValidationProvider>
  );
}

describe("EnvironmentSettingsTab", () => {
  it("renders without a project open (no empty-state guard)", async () => {
    renderTab();

    await waitFor(() => {
      expect(screen.getByText("Environment Variables")).toBeTruthy();
    });
    expect(screen.queryByText("No project open")).toBeNull();
  });

  it("loads global env vars via IPC on mount", async () => {
    window.electron = {
      globalEnv: {
        get: vi.fn().mockResolvedValue({ NODE_ENV: "production", PORT: "3000" }),
        set: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as typeof window.electron;

    renderTab();

    await waitFor(() => {
      expect(window.electron.globalEnv.get).toHaveBeenCalledTimes(1);
    });

    const nameInputs = screen.getAllByLabelText("Environment variable name");
    expect(nameInputs).toHaveLength(2);
  });

  it("saves global env vars via IPC", async () => {
    window.electron = {
      globalEnv: {
        get: vi.fn().mockResolvedValue({ EXISTING: "value" }),
        set: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as typeof window.electron;

    renderTab();

    await waitFor(() => {
      expect(screen.getAllByLabelText("Environment variable name")).toHaveLength(1);
    });

    const valueInput = screen.getByLabelText("Environment variable value");
    fireEvent.change(valueInput, { target: { value: "new-value" } });

    const saveButton = screen.getByRole("button", { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(window.electron.globalEnv.set).toHaveBeenCalledWith({ EXISTING: "new-value" });
    });
  });

  it("shows description about global scope", async () => {
    renderTab();

    await waitFor(() => {
      expect(
        screen.getByText(
          "Global environment variables injected into all new terminals. Project-level variables override globals with the same name."
        )
      ).toBeTruthy();
    });
  });

  it("blocks editing and notifies the user when globalEnv.get fails", async () => {
    window.electron = {
      globalEnv: {
        get: vi.fn().mockRejectedValue(new Error("IPC channel not found")),
        set: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as typeof window.electron;

    renderTab();

    await waitFor(() => {
      expect(screen.getByText(/Couldn't load saved environment variables/)).toBeTruthy();
    });

    // Save and editing affordances must be absent so a failed load can't
    // overwrite the user's stored variables with an empty record.
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /add variable/i })).toBeNull();

    expect(logError).toHaveBeenCalledWith("Failed to load global env vars", expect.any(Error));
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        title: "Couldn't load environment variables",
        priority: "high",
        duration: 0,
      })
    );
  });

  it("wires aria-invalid and aria-describedby on the key input when a row error is shown", async () => {
    window.electron = {
      globalEnv: {
        get: vi.fn().mockResolvedValue({ FOO: "bar" }),
        set: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as typeof window.electron;

    renderTab();

    await waitFor(() => {
      expect(screen.getAllByLabelText("Environment variable name")).toHaveLength(1);
    });

    const nameInput = screen.getByLabelText("Environment variable name");
    fireEvent.change(nameInput, { target: { value: "1invalid" } });

    const saveButton = screen.getByRole("button", { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(nameInput.getAttribute("aria-invalid")).toBe("true");
    });

    const describedBy = nameInput.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(describedBy).toMatch(/^env-error-/);
    expect(document.getElementById(describedBy!)?.textContent).toContain("Invalid name");

    // Value input must NOT receive the row-level error wiring — the row
    // errors are about the key, not the value.
    const valueInput = screen.getByLabelText("Environment variable value");
    expect(valueInput.getAttribute("aria-invalid")).toBeNull();
    expect(valueInput.getAttribute("aria-describedby")).toBeNull();
  });

  it("flags duplicate variable name on the second key input via aria-invalid", async () => {
    window.electron = {
      globalEnv: {
        get: vi.fn().mockResolvedValue({ FOO: "first", BAR: "second" }),
        set: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as typeof window.electron;

    renderTab();

    await waitFor(() => {
      expect(screen.getAllByLabelText("Environment variable name")).toHaveLength(2);
    });

    const nameInputs = screen.getAllByLabelText("Environment variable name");
    fireEvent.change(nameInputs[1]!, { target: { value: "FOO" } });

    const saveButton = screen.getByRole("button", { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(nameInputs[1]!.getAttribute("aria-invalid")).toBe("true");
    });

    const describedBy = nameInputs[1]!.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toContain("Duplicate");
    expect(nameInputs[0]!.getAttribute("aria-invalid")).toBeNull();
  });

  it("emits role=alert on saveError when globalEnv.set fails", async () => {
    window.electron = {
      globalEnv: {
        get: vi.fn().mockResolvedValue({ FOO: "bar" }),
        set: vi.fn().mockRejectedValue(new Error("IPC failed")),
      },
    } as unknown as typeof window.electron;

    renderTab();

    await waitFor(() => {
      expect(screen.getAllByLabelText("Environment variable name")).toHaveLength(1);
    });

    const valueInput = screen.getByLabelText("Environment variable value");
    fireEvent.change(valueInput, { target: { value: "changed" } });

    const saveButton = screen.getByRole("button", { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("IPC failed");
    });
  });

  it("adds new variable row and saves via globalEnv.set", async () => {
    window.electron = {
      globalEnv: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as typeof window.electron;

    renderTab();

    await waitFor(() => {
      expect(screen.getByText("No environment variables configured yet")).toBeTruthy();
    });

    const addButton = screen.getByRole("button", { name: /add variable/i });
    fireEvent.click(addButton);

    const nameInput = screen.getByLabelText("Environment variable name");
    const valueInput = screen.getByLabelText("Environment variable value");

    fireEvent.change(nameInput, { target: { value: "NEW_VAR" } });
    fireEvent.change(valueInput, { target: { value: "new_value" } });

    const saveButton = screen.getByRole("button", { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(window.electron.globalEnv.set).toHaveBeenCalledWith({ NEW_VAR: "new_value" });
    });
  });
});
