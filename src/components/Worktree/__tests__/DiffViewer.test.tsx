// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { DiffViewer, _resetLangStateForTests } from "../DiffViewer";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("refractor/rust", () => {
  throw new Error("Failed to fetch dynamically imported module");
});

vi.mock("@/services/ActionService", () => ({
  actionService: {
    dispatch: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

const rustDiff = `diff --git a/main.rs b/main.rs
index abc123..def456 100644
--- a/main.rs
+++ b/main.rs
@@ -1,3 +1,3 @@
-fn old() {
+fn new() {
   let x = 1;
-  return x;
+  return x + 1;
 }`;

const jsDiff = `diff --git a/app.js b/app.js
index 123abc..456def 100644
--- a/app.js
+++ b/app.js
@@ -1,1 +1,1 @@
-console.log("old");
+console.log("new");`;

function wrap(ui: React.ReactElement) {
  return <TooltipProvider>{ui}</TooltipProvider>;
}

describe("DiffViewer", () => {
  beforeEach(() => {
    _resetLangStateForTests();
  });

  it("shows Plain text badge when refractor chunk load fails", async () => {
    render(wrap(<DiffViewer diff={rustDiff} filePath="main.rs" />));
    await waitFor(() => {
      expect(screen.getByTestId("diff-plain-text-badge")).toBeTruthy();
    });
    expect(screen.getByTestId("diff-plain-text-badge").textContent).toBe("Plain text");
  });

  it("does not show Plain text badge for built-in languages", async () => {
    render(wrap(<DiffViewer diff={jsDiff} filePath="app.js" />));
    await waitFor(() => {
      expect(screen.getByText("app.js")).toBeTruthy();
    });
    expect(screen.queryByTestId("diff-plain-text-badge")).toBeNull();
  });

  it("does not show Plain text badge for unknown file extensions", async () => {
    const unknownDiff = `diff --git a/foo.xyz b/foo.xyz
index 000..111 100644
--- a/foo.xyz
+++ b/foo.xyz
@@ -1,1 +1,1 @@
-old
+new`;
    render(wrap(<DiffViewer diff={unknownDiff} filePath="foo.xyz" />));
    await waitFor(() => {
      expect(screen.getByText("foo.xyz")).toBeTruthy();
    });
    expect(screen.queryByTestId("diff-plain-text-badge")).toBeNull();
  });

  it("renders NO_CHANGES sentinel", () => {
    render(wrap(<DiffViewer diff="NO_CHANGES" filePath="src/index.ts" />));
    expect(screen.getByText("No changes detected")).toBeTruthy();
  });

  it("renders BINARY_FILE sentinel", () => {
    render(wrap(<DiffViewer diff="BINARY_FILE" filePath="src/index.ts" />));
    expect(screen.getByText("Binary file - cannot display diff")).toBeTruthy();
  });

  it("renders FILE_TOO_LARGE sentinel", () => {
    render(wrap(<DiffViewer diff="FILE_TOO_LARGE" filePath="src/index.ts" />));
    expect(screen.getByText(/File too large to display diff/)).toBeTruthy();
  });

  it("renders ERROR sentinel with error message", () => {
    render(wrap(<DiffViewer diff="ERROR" filePath="src/index.ts" />));
    expect(screen.getByText("Failed to load diff")).toBeTruthy();
  });

  it("does not render parse-failure fallback for ERROR sentinel", () => {
    render(wrap(<DiffViewer diff="ERROR" filePath="src/index.ts" />));
    // ERROR sentinel is checked before files.length, so we get the error UI
    expect(screen.getByText("Failed to load diff")).toBeTruthy();
    expect(screen.queryByText("Unable to parse diff")).toBeNull();
  });

  it("renders retry button when onRetry is provided", () => {
    const onRetry = vi.fn();
    render(wrap(<DiffViewer diff="ERROR" filePath="src/index.ts" onRetry={onRetry} />));
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("does not render retry button when onRetry is omitted", () => {
    render(wrap(<DiffViewer diff="ERROR" filePath="src/index.ts" />));
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("calls onRetry when retry button is clicked", () => {
    const onRetry = vi.fn();
    render(wrap(<DiffViewer diff="ERROR" filePath="src/index.ts" onRetry={onRetry} />));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders empty diff sentinel", () => {
    render(wrap(<DiffViewer diff="" filePath="src/index.ts" />));
    expect(screen.getByText("No changes detected")).toBeTruthy();
  });

  it("renders parse failure when diff is unparseable", () => {
    render(wrap(<DiffViewer diff="not a real diff" filePath="src/index.ts" />));
    expect(screen.getByText("Unable to parse diff")).toBeTruthy();
  });
});
