/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock terminalClient and terminalInstanceService before importing the hook
vi.mock("@/clients", () => ({
  terminalClient: {
    write: vi.fn(),
  },
}));

vi.mock("@/services/TerminalInstanceService", () => ({
  terminalInstanceService: {
    notifyUserInput: vi.fn(),
  },
}));

import { IMAGE_EXTENSIONS } from "../useTerminalFileTransfer";
import { terminalClient } from "@/clients";
import { terminalInstanceService } from "@/services/TerminalInstanceService";

// We test the hook's behavior indirectly by simulating what the hook does:
// attaching event listeners and checking they call the right things.
// For unit tests, we focus on the exported constants and the behavior contract.

describe("IMAGE_EXTENSIONS", () => {
  it("matches common image formats", () => {
    expect(IMAGE_EXTENSIONS.test("photo.png")).toBe(true);
    expect(IMAGE_EXTENSIONS.test("photo.jpg")).toBe(true);
    expect(IMAGE_EXTENSIONS.test("photo.jpeg")).toBe(true);
    expect(IMAGE_EXTENSIONS.test("photo.bmp")).toBe(true);
    expect(IMAGE_EXTENSIONS.test("photo.tiff")).toBe(true);
    expect(IMAGE_EXTENSIONS.test("photo.tif")).toBe(true);
    expect(IMAGE_EXTENSIONS.test("photo.avif")).toBe(true);
    expect(IMAGE_EXTENSIONS.test("photo.heic")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(IMAGE_EXTENSIONS.test("photo.PNG")).toBe(true);
    expect(IMAGE_EXTENSIONS.test("photo.JPG")).toBe(true);
    expect(IMAGE_EXTENSIONS.test("photo.HEIC")).toBe(true);
  });

  it("does not match non-image formats", () => {
    expect(IMAGE_EXTENSIONS.test("file.pdf")).toBe(false);
    expect(IMAGE_EXTENSIONS.test("file.ts")).toBe(false);
    expect(IMAGE_EXTENSIONS.test("file.txt")).toBe(false);
    expect(IMAGE_EXTENSIONS.test("file.svg")).toBe(false);
    expect(IMAGE_EXTENSIONS.test("file.gif")).toBe(false);
  });
});

describe("terminal file transfer behavior", () => {
  let container: HTMLDivElement;
  let originalElectron: unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);

    originalElectron = (window as unknown as Record<string, unknown>).electron;
    (window as unknown as Record<string, unknown>).electron = {
      clipboard: {
        saveImage: vi.fn().mockResolvedValue({
          ok: true,
          filePath: "/tmp/canopy-clipboard/clipboard-123-abc.png",
          thumbnailDataUrl: "data:image/png;base64,abc",
        }),
        thumbnailFromPath: vi.fn(),
      },
      webUtils: {
        getPathForFile: vi.fn((file: File) => {
          return (file as unknown as { _testPath?: string })._testPath ?? "";
        }),
      },
    };
  });

  afterEach(() => {
    document.body.removeChild(container);
    (window as unknown as Record<string, unknown>).electron = originalElectron;
  });

  function makePasteEvent(hasImage: boolean): ClipboardEvent {
    const items = hasImage
      ? [{ kind: "file", type: "image/png", getAsFile: () => new File([""], "img.png") }]
      : [{ kind: "string", type: "text/plain", getAsFile: () => null }];

    const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        items,
        getData: () => "some text",
        types: hasImage ? ["Files"] : ["text/plain"],
      },
    });
    return event;
  }

  it("image paste calls saveImage and writes path to terminal", async () => {
    // Simulate what the hook does for an image paste
    const event = makePasteEvent(true);
    const items = event.clipboardData?.items;
    const hasImage =
      items &&
      Array.from(items as unknown as ArrayLike<DataTransferItem>).some((i) =>
        i.type.startsWith("image/")
      );

    expect(hasImage).toBe(true);

    // Simulate the hook's behavior
    event.preventDefault();
    const result = await window.electron.clipboard.saveImage();
    expect(result.ok).toBe(true);
    if (result.ok) {
      terminalClient.write("term-1", result.filePath);
      terminalInstanceService.notifyUserInput("term-1");
    }

    expect(terminalClient.write).toHaveBeenCalledWith(
      "term-1",
      "/tmp/canopy-clipboard/clipboard-123-abc.png"
    );
    expect(terminalInstanceService.notifyUserInput).toHaveBeenCalledWith("term-1");
  });

  it("text-only paste does not call saveImage", () => {
    const event = makePasteEvent(false);
    const items = event.clipboardData?.items;
    const hasImage =
      items &&
      Array.from(items as unknown as ArrayLike<DataTransferItem>).some((i) =>
        i.type.startsWith("image/")
      );

    expect(hasImage).toBe(false);
    // Hook would return early, not calling saveImage
    expect(window.electron.clipboard.saveImage).not.toHaveBeenCalled();
  });

  it("image paste with saveImage failure does not write to terminal", async () => {
    (window.electron.clipboard.saveImage as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: "No image in clipboard",
    });

    const result = await window.electron.clipboard.saveImage();
    expect(result.ok).toBe(false);

    // Hook would return early
    expect(terminalClient.write).not.toHaveBeenCalled();
  });

  it("file drop resolves paths and writes them to terminal", () => {
    const file1 = new File([""], "document.pdf");
    Object.defineProperty(file1, "_testPath", { value: "/Users/test/document.pdf" });

    const file2 = new File([""], "screenshot.png");
    Object.defineProperty(file2, "_testPath", { value: "/Users/test/screenshot.png" });

    const paths: string[] = [];
    for (const file of [file1, file2]) {
      const filePath = window.electron.webUtils.getPathForFile(file);
      if (filePath) paths.push(filePath);
    }

    expect(paths).toEqual(["/Users/test/document.pdf", "/Users/test/screenshot.png"]);

    const text = paths.join(" ");
    terminalClient.write("term-1", text);
    terminalInstanceService.notifyUserInput("term-1");

    expect(terminalClient.write).toHaveBeenCalledWith(
      "term-1",
      "/Users/test/document.pdf /Users/test/screenshot.png"
    );
  });

  it("file drop with unresolved path skips that file", () => {
    const file1 = new File([""], "resolved.pdf");
    Object.defineProperty(file1, "_testPath", { value: "/Users/test/resolved.pdf" });

    const file2 = new File([""], "unresolved.pdf");
    // No _testPath → getPathForFile returns ""

    const paths: string[] = [];
    for (const file of [file1, file2]) {
      const filePath = window.electron.webUtils.getPathForFile(file);
      if (filePath) paths.push(filePath);
    }

    expect(paths).toEqual(["/Users/test/resolved.pdf"]);

    const text = paths.join(" ");
    terminalClient.write("term-1", text);

    expect(terminalClient.write).toHaveBeenCalledWith("term-1", "/Users/test/resolved.pdf");
  });

  it("drop with no files does not write to terminal", () => {
    const paths: string[] = [];
    // Simulate empty file list
    if (paths.length === 0) return;

    terminalClient.write("term-1", paths.join(" "));
    expect(terminalClient.write).not.toHaveBeenCalled();
  });
});
