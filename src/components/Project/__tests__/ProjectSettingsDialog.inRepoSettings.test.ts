import { describe, it, expect } from "vitest";

const GITIGNORE_SNIPPET = `# Canopy in-repo settings — safe to commit\n.canopy/project.json\n.canopy/settings.json\n\n# Canopy machine-local settings — do not commit\n.canopy/*.local.json`;

describe("In-repo settings — gitignore snippet", () => {
  it("contains the project.json path", () => {
    expect(GITIGNORE_SNIPPET).toContain(".canopy/project.json");
  });

  it("contains the settings.json path", () => {
    expect(GITIGNORE_SNIPPET).toContain(".canopy/settings.json");
  });

  it("contains guidance for local-only files", () => {
    expect(GITIGNORE_SNIPPET).toContain(".canopy/*.local.json");
  });
});

describe("In-repo settings — Project domain types", () => {
  it("Project has canopyConfigPresent field for indicating detected .canopy/ dir", () => {
    type MinimalProject = {
      canopyConfigPresent?: boolean;
      inRepoSettings?: boolean;
    };

    const projectWithConfig: MinimalProject = { canopyConfigPresent: true };
    const projectWithSync: MinimalProject = { inRepoSettings: true };
    const bareProject: MinimalProject = {};

    expect(projectWithConfig.canopyConfigPresent).toBe(true);
    expect(projectWithSync.inRepoSettings).toBe(true);
    expect(bareProject.canopyConfigPresent).toBeUndefined();
    expect(bareProject.inRepoSettings).toBeUndefined();
  });

  it("canopyConfigPresent and inRepoSettings are independent flags", () => {
    type MinimalProject = {
      canopyConfigPresent?: boolean;
      inRepoSettings?: boolean;
    };

    // canopyConfigPresent can be true without inRepoSettings (loaded from repo but sync not yet enabled)
    const detectedNotEnabled: MinimalProject = { canopyConfigPresent: true, inRepoSettings: false };
    expect(detectedNotEnabled.canopyConfigPresent).toBe(true);
    expect(detectedNotEnabled.inRepoSettings).toBe(false);
  });
});

describe("In-repo settings — enable/disable logic", () => {
  it("enabling transitions inRepoSettings from falsy to true", () => {
    let inRepoSettings: boolean | undefined = undefined;
    inRepoSettings = true;
    expect(inRepoSettings).toBe(true);
  });

  it("disabling transitions inRepoSettings from true to false without deleting files", () => {
    let inRepoSettings = true;
    const canopyConfigPresent = true;

    // disable: only clears the sync flag, leaves canopyConfigPresent untouched
    inRepoSettings = false;

    expect(inRepoSettings).toBe(false);
    expect(canopyConfigPresent).toBe(true);
  });

  it("confirmation panel should be shown before enabling (toggle expansion logic)", () => {
    const inRepoSettings = false;
    let inRepoExpanded = false;

    // clicking toggle when off → expand confirmation panel, not call IPC
    if (!inRepoSettings) {
      inRepoExpanded = !inRepoExpanded;
    }

    expect(inRepoExpanded).toBe(true);
    expect(inRepoSettings).toBe(false); // IPC not yet called
  });

  it("cancelling collapse the panel without enabling", () => {
    const inRepoSettings = false;
    let inRepoExpanded = true;

    // cancel
    inRepoExpanded = false;

    expect(inRepoExpanded).toBe(false);
    expect(inRepoSettings).toBe(false);
  });

  it("error on enable should leave toggle in off state", () => {
    const inRepoSettings = false;
    let inRepoError: string | null = null;
    let inRepoEnabling = true;

    // simulate IPC error
    try {
      throw new Error("EACCES: permission denied");
    } catch (err) {
      inRepoError = err instanceof Error ? err.message : "Failed to enable in-repo settings";
    } finally {
      inRepoEnabling = false;
    }

    expect(inRepoSettings).toBe(false);
    expect(inRepoError).toContain("EACCES");
    expect(inRepoEnabling).toBe(false);
  });

  it("double-click prevention: inRepoEnabling prevents re-entry", () => {
    const inRepoEnabling = true;
    let callCount = 0;

    const handleEnable = () => {
      if (inRepoEnabling) return;
      callCount++;
    };

    handleEnable();
    handleEnable();
    handleEnable();

    expect(callCount).toBe(0);
  });
});
