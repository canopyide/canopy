import { describe, it, expect } from "vitest";

describe("Dock Popover Visual Layer - Issue #2316", () => {
  describe("Component Removal", () => {
    it("should not have DockPopupScrim component file", async () => {
      const fs = await import("fs/promises");
      const path = await import("path");

      const componentPath = path.resolve(__dirname, "../DockPopupScrim.tsx");
      const fileExists = await fs
        .access(componentPath)
        .then(() => true)
        .catch(() => false);

      expect(fileExists).toBe(false);
    });

    it("should not import DockPopupScrim in DockedTerminalItem", async () => {
      const fs = await import("fs/promises");
      const path = await import("path");

      const filePath = path.resolve(__dirname, "../DockedTerminalItem.tsx");
      const content = await fs.readFile(filePath, "utf-8");

      expect(content).not.toContain("DockPopupScrim");
    });

    it("should not import DockPopupScrim in DockedTabGroup", async () => {
      const fs = await import("fs/promises");
      const path = await import("path");

      const filePath = path.resolve(__dirname, "../DockedTabGroup.tsx");
      const content = await fs.readFile(filePath, "utf-8");

      expect(content).not.toContain("DockPopupScrim");
    });
  });

  describe("Shadow Token Usage", () => {
    it("should use --shadow-dock-panel-popover in DockedTerminalItem", async () => {
      const fs = await import("fs/promises");
      const path = await import("path");

      const filePath = path.resolve(__dirname, "../DockedTerminalItem.tsx");
      const content = await fs.readFile(filePath, "utf-8");

      expect(content).toContain("--shadow-dock-panel-popover");
    });

    it("should use --shadow-dock-panel-popover in DockedTabGroup", async () => {
      const fs = await import("fs/promises");
      const path = await import("path");

      const filePath = path.resolve(__dirname, "../DockedTabGroup.tsx");
      const content = await fs.readFile(filePath, "utf-8");

      expect(content).toContain("--shadow-dock-panel-popover");
    });
  });
});
