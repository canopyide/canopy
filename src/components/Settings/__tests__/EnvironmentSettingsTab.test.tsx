// @vitest-environment jsdom

import { createRef } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("flushRef saves dirty rows via globalEnv.set without an explicit Save click (#6875)", async () => {
    window.electron = {
      globalEnv: {
        get: vi.fn().mockResolvedValue({ EXISTING: "value" }),
        set: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as typeof window.electron;

    const flushRef = createRef<(() => Promise<void>) | null>();
    render(
      <SettingsValidationProvider>
        <EnvironmentSettingsTab flushRef={flushRef} />
      </SettingsValidationProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByLabelText("Environment variable name")).toHaveLength(1);
    });

    const valueInput = screen.getByLabelText("Environment variable value");
    fireEvent.change(valueInput, { target: { value: "new-value" } });

    expect(flushRef.current).toBeTruthy();
    await act(async () => {
      await flushRef.current?.();
    });

    expect(window.electron.globalEnv.set).toHaveBeenCalledWith({ EXISTING: "new-value" });
  });

  it("flushRef silently drops empty-key drafts (matches sanitize-on-save policy)", async () => {
    window.electron = {
      globalEnv: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as typeof window.electron;

    const flushRef = createRef<(() => Promise<void>) | null>();
    render(
      <SettingsValidationProvider>
        <EnvironmentSettingsTab flushRef={flushRef} />
      </SettingsValidationProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("No environment variables configured yet")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /add variable/i }));
    // Leave the key empty — the row is dirty but unsaveable. Flush should
    // still be safe to call and write an empty record.
    fireEvent.change(screen.getByLabelText("Environment variable value"), {
      target: { value: "stranded" },
    });

    await act(async () => {
      await flushRef.current?.();
    });

    expect(window.electron.globalEnv.set).toHaveBeenCalledWith({});
  });

  it("flushRef is a no-op when nothing is dirty", async () => {
    window.electron = {
      globalEnv: {
        get: vi.fn().mockResolvedValue({ EXISTING: "value" }),
        set: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as typeof window.electron;

    const flushRef = createRef<(() => Promise<void>) | null>();
    render(
      <SettingsValidationProvider>
        <EnvironmentSettingsTab flushRef={flushRef} />
      </SettingsValidationProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByLabelText("Environment variable name")).toHaveLength(1);
    });

    await act(async () => {
      await flushRef.current?.();
    });

    expect(window.electron.globalEnv.set).not.toHaveBeenCalled();
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
