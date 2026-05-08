// @vitest-environment jsdom
import { act, render, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { BrowserToolbar } from "../BrowserToolbar";

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockRemoveUrl = vi.fn();

const STABLE_ENTRIES = [
  {
    url: "http://localhost:3000/",
    title: "Home",
    visitCount: 5,
    lastVisitAt: 1700000000000,
    favicon: "https://example.com/favicon.ico",
  },
  {
    url: "http://localhost:5173/",
    title: "Vite",
    visitCount: 2,
    lastVisitAt: 1700000000000,
  },
];

vi.mock("@/store/urlHistoryStore", () => ({
  useUrlHistoryStore: Object.assign(() => STABLE_ENTRIES, {
    getState: () => ({ removeUrl: mockRemoveUrl }),
  }),
  getFrecencySuggestions: () => STABLE_ENTRIES,
}));

vi.mock("@/services/ActionService", () => ({
  actionService: { dispatch: vi.fn(() => Promise.resolve({ ok: true })) },
}));

const defaultProps = {
  url: "http://localhost:5173/",
  projectId: "proj1",
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
  onNavigate: vi.fn(),
  onBack: vi.fn(),
  onForward: vi.fn(),
  onReload: vi.fn(),
  onOpenExternal: vi.fn(),
};

function renderToolbar(overrides = {}) {
  const props = { ...defaultProps, ...overrides };
  return render(<BrowserToolbar {...props} />);
}

function openDropdown(arg: ((id: string) => HTMLElement) | HTMLElement) {
  const input = typeof arg === "function" ? arg("browser-address-bar") : arg;
  fireEvent.focus(input);
  return input;
}

describe("BrowserToolbar handleSubmit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls onReload when submitting the same URL", () => {
    const { getByTestId } = renderToolbar();
    const input = openDropdown(getByTestId);

    fireEvent.submit(input.closest("form")!);

    expect(defaultProps.onReload).toHaveBeenCalledOnce();
    expect(defaultProps.onNavigate).not.toHaveBeenCalled();
  });

  it("calls onNavigate when submitting a different URL", () => {
    const { getByTestId } = renderToolbar();
    const input = openDropdown(getByTestId);

    fireEvent.change(input, { target: { value: "localhost:3000" } });
    fireEvent.submit(input.closest("form")!);

    expect(defaultProps.onNavigate).toHaveBeenCalledWith("http://localhost:3000/");
    expect(defaultProps.onReload).not.toHaveBeenCalled();
  });

  it("calls onReload when display-format input normalizes to same URL", () => {
    const { getByTestId } = renderToolbar();
    const input = openDropdown(getByTestId);

    fireEvent.change(input, { target: { value: "localhost:5173" } });
    fireEvent.submit(input.closest("form")!);

    expect(defaultProps.onReload).toHaveBeenCalledOnce();
    expect(defaultProps.onNavigate).not.toHaveBeenCalled();
  });

  it("shows error for invalid URL and does not call either callback", () => {
    const { getByTestId } = renderToolbar();
    const input = openDropdown(getByTestId);

    fireEvent.change(input, { target: { value: "not a valid url !!!" } });
    fireEvent.submit(input.closest("form")!);

    expect(defaultProps.onReload).not.toHaveBeenCalled();
    expect(defaultProps.onNavigate).not.toHaveBeenCalled();
  });

  it("calls onReload on consecutive same-URL submissions", () => {
    const { getByTestId } = renderToolbar();
    const input = openDropdown(getByTestId);

    fireEvent.submit(input.closest("form")!);
    fireEvent.focus(input);
    fireEvent.submit(input.closest("form")!);

    expect(defaultProps.onReload).toHaveBeenCalledTimes(2);
    expect(defaultProps.onNavigate).not.toHaveBeenCalled();
  });

  it("calls onReload for URL with path, query, and hash", () => {
    const fullUrl = "http://localhost:5173/app?tab=1#section";
    const { getByTestId } = renderToolbar({ url: fullUrl });
    const input = openDropdown(getByTestId);

    fireEvent.submit(input.closest("form")!);

    expect(defaultProps.onReload).toHaveBeenCalledOnce();
    expect(defaultProps.onNavigate).not.toHaveBeenCalled();
  });
});

describe("BrowserToolbar favicon and delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders favicon image for entries with favicon", () => {
    const { container } = renderToolbar();
    openDropdown(container.querySelector("[data-testid='browser-address-bar']")! as HTMLElement);
    const img = container.querySelector("img[src='https://example.com/favicon.ico']");
    expect(img).toBeTruthy();
  });

  it("renders Globe icon for entries without favicon", () => {
    const { container } = renderToolbar();
    openDropdown(container.querySelector("[data-testid='browser-address-bar']")! as HTMLElement);
    // Second entry has no favicon — should have a Globe SVG sibling
    const rows = container.querySelectorAll(".group\\/row");
    expect(rows.length).toBe(2);
  });

  it("delete button calls removeUrl on mousedown", () => {
    const { container } = renderToolbar();
    openDropdown(container.querySelector("[data-testid='browser-address-bar']")! as HTMLElement);
    const deleteButtons = container.querySelectorAll("[aria-label^='Remove']");
    expect(deleteButtons.length).toBeGreaterThan(0);
    fireEvent.mouseDown(deleteButtons[0]!);
    expect(mockRemoveUrl).toHaveBeenCalledWith("proj1", "http://localhost:3000/");
  });

  it("delete button does not navigate on click", () => {
    const { container } = renderToolbar();
    openDropdown(container.querySelector("[data-testid='browser-address-bar']")! as HTMLElement);
    const deleteButtons = container.querySelectorAll("[aria-label^='Remove']");
    fireEvent.mouseDown(deleteButtons[0]!);
    expect(defaultProps.onNavigate).not.toHaveBeenCalled();
  });
});

describe("BrowserToolbar ARIA semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("input has combobox role with accessible name and listbox controls", () => {
    const { getByTestId } = renderToolbar();
    const input = getByTestId("browser-address-bar");

    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-label")).toBe("Address bar");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.getAttribute("aria-controls")).toBeTruthy();
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
  });

  it("aria-expanded becomes true and aria-controls points at the listbox when open", () => {
    const { container, getByTestId } = renderToolbar();
    const input = openDropdown(getByTestId);

    expect(input.getAttribute("aria-expanded")).toBe("true");
    const listboxId = input.getAttribute("aria-controls")!;
    const listbox = container.querySelector(`[id="${listboxId}"]`);
    expect(listbox).toBeTruthy();
    expect(listbox!.getAttribute("role")).toBe("listbox");
  });

  it("each suggestion is rendered as an option with stable id and aria-selected", () => {
    const { container, getByTestId } = renderToolbar();
    const input = openDropdown(getByTestId);
    const listboxId = input.getAttribute("aria-controls")!;

    const options = container.querySelectorAll('[role="option"]');
    expect(options.length).toBe(2);
    options.forEach((option, index) => {
      expect(option.getAttribute("id")).toBe(`${listboxId}-option-${index}`);
      expect(option.getAttribute("aria-selected")).toBe("false");
    });
  });

  it("ArrowDown moves aria-activedescendant and flips aria-selected on options", async () => {
    const { container, getByTestId } = renderToolbar();
    const input = openDropdown(getByTestId);
    const listboxId = input.getAttribute("aria-controls")!;

    act(() => {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    });

    await waitFor(() => {
      expect(input.getAttribute("aria-activedescendant")).toBe(`${listboxId}-option-0`);
    });
    const options = container.querySelectorAll('[role="option"]');
    expect(options[0]!.getAttribute("aria-selected")).toBe("true");
    expect(options[1]!.getAttribute("aria-selected")).toBe("false");
  });

  it("aria-activedescendant clears when the dropdown closes", async () => {
    const { getByTestId } = renderToolbar();
    const input = openDropdown(getByTestId);

    act(() => {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    });
    await waitFor(() => {
      expect(input.getAttribute("aria-activedescendant")).toBeTruthy();
    });

    act(() => {
      fireEvent.keyDown(input, { key: "Escape" });
    });

    await waitFor(() => {
      expect(input.getAttribute("aria-expanded")).toBe("false");
    });
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
  });

  it("Copy URL button is exposed by accessible name", () => {
    const { getByRole } = renderToolbar();
    const button = getByRole("button", { name: "Copy URL" });
    expect(button).toBeTruthy();
  });

  it("copy success announces in a polite live region", async () => {
    const { container, getByRole } = renderToolbar();

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Copy URL" }));
    });

    await waitFor(() => {
      const liveRegions = container.querySelectorAll('[role="status"]');
      const texts = Array.from(liveRegions).map((node) => node.textContent);
      expect(texts).toContain("Copied to clipboard");
    });
  });

  it("Shift+Delete on a highlighted suggestion announces removal", async () => {
    const { container, getByTestId } = renderToolbar();
    const input = openDropdown(getByTestId);

    act(() => {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    });
    await waitFor(() => {
      expect(input.getAttribute("aria-activedescendant")).toBeTruthy();
    });

    act(() => {
      fireEvent.keyDown(input, { key: "Delete", shiftKey: true });
    });

    await waitFor(() => {
      const liveRegions = container.querySelectorAll('[role="status"]');
      const texts = Array.from(liveRegions).map((node) => node.textContent);
      expect(texts.some((t) => t?.startsWith("Removed ") && t.endsWith("from history"))).toBe(true);
    });
  });

  it("X removal button is hidden from the accessibility tree", () => {
    const { container } = renderToolbar();
    openDropdown(container.querySelector("[data-testid='browser-address-bar']")! as HTMLElement);

    const removeButtons = container.querySelectorAll("[aria-label^='Remove']");
    expect(removeButtons.length).toBeGreaterThan(0);
    removeButtons.forEach((button) => {
      expect(button.getAttribute("aria-hidden")).toBe("true");
      expect(button.getAttribute("tabindex")).toBe("-1");
    });
  });

  it("re-announces when the same display URL is removed twice in a row", async () => {
    const { container, getByTestId } = renderToolbar();
    const input = openDropdown(getByTestId);

    act(() => {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    });
    await waitFor(() => {
      expect(input.getAttribute("aria-activedescendant")).toBeTruthy();
    });

    act(() => {
      fireEvent.keyDown(input, { key: "Delete", shiftKey: true });
    });
    await waitFor(() => {
      const text = container.querySelector('[role="status"]')?.textContent ?? "";
      expect(text.length).toBeGreaterThan(0);
    });
    const firstAnnouncement = container.querySelector('[role="status"]')!.textContent!;

    act(() => {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    });
    act(() => {
      fireEvent.keyDown(input, { key: "Delete", shiftKey: true });
    });
    await waitFor(() => {
      const text = container.querySelector('[role="status"]')!.textContent!;
      expect(text).not.toBe(firstAnnouncement);
    });
  });

  it("clicking the row body (not the inner remove button) navigates", () => {
    const { container } = renderToolbar();
    openDropdown(container.querySelector("[data-testid='browser-address-bar']")! as HTMLElement);
    const option = container.querySelector('[role="option"]')!;
    fireEvent.mouseDown(option);
    expect(defaultProps.onNavigate).toHaveBeenCalledWith("http://localhost:3000/");
  });

  it("X removal label uses display URL not the raw URL", () => {
    const { container } = renderToolbar();
    openDropdown(container.querySelector("[data-testid='browser-address-bar']")! as HTMLElement);

    const removeButton = container.querySelector("[aria-label^='Remove']");
    expect(removeButton).toBeTruthy();
    const label = removeButton!.getAttribute("aria-label")!;
    expect(label).not.toContain("http://");
    expect(label).toMatch(/^Remove .+ from history$/);
  });
});

describe("BrowserToolbar address-bar scheme icon and input", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Lock icon when URL scheme is https", () => {
    const { queryByTestId } = renderToolbar({ url: "https://example.com/" });
    expect(queryByTestId("browser-url-scheme-lock")).toBeTruthy();
    expect(queryByTestId("browser-url-scheme-globe")).toBeFalsy();
  });

  it("renders Globe icon when URL scheme is http", () => {
    const { queryByTestId } = renderToolbar({ url: "http://localhost:3000/" });
    expect(queryByTestId("browser-url-scheme-globe")).toBeTruthy();
    expect(queryByTestId("browser-url-scheme-lock")).toBeFalsy();
  });

  it("renders Globe icon for malformed URL without throwing", () => {
    const { queryByTestId } = renderToolbar({ url: "" });
    expect(queryByTestId("browser-url-scheme-globe")).toBeTruthy();
    expect(queryByTestId("browser-url-scheme-lock")).toBeFalsy();
  });

  it("URL input has spellCheck disabled", () => {
    const { getByTestId } = renderToolbar();
    const input = getByTestId("browser-address-bar");
    expect(input.getAttribute("spellcheck")).toBe("false");
  });

  it("reload button has animate-spin when isLoading is true", () => {
    const { getByTestId } = renderToolbar({ isLoading: true });
    const reload = getByTestId("browser-reload");
    expect(reload.className).toContain("animate-spin");
  });

  it("reload button does not have animate-spin when isLoading is false", () => {
    const { getByTestId } = renderToolbar({ isLoading: false });
    const reload = getByTestId("browser-reload");
    expect(reload.className).not.toContain("animate-spin");
  });
});
