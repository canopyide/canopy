import { describe, expect, it, vi } from "vitest";

import { CHANNELS } from "../channels.js";
import {
  SLASH_COMMANDS_METHOD_CHANNELS,
  buildSlashCommandsPreloadBindings,
} from "../handlers/slashCommands.preload.js";
import {
  GLOBAL_ENV_METHOD_CHANNELS,
  buildGlobalEnvPreloadBindings,
} from "../handlers/globalEnv.preload.js";
import { HELP_METHOD_CHANNELS, buildHelpPreloadBindings } from "../handlers/help.preload.js";
import {
  ACCESSIBILITY_METHOD_CHANNELS,
  buildAccessibilityPreloadBindings,
} from "../handlers/accessibility.preload.js";
import {
  EVENT_INSPECTOR_METHOD_CHANNELS,
  buildEventInspectorPreloadBindings,
} from "../handlers/eventInspector.preload.js";
import {
  COMMANDS_METHOD_CHANNELS,
  buildCommandsPreloadBindings,
} from "../handlers/commands.preload.js";
import { PORTAL_METHOD_CHANNELS, buildPortalPreloadBindings } from "../handlers/portal.preload.js";
import {
  DEV_PREVIEW_METHOD_CHANNELS,
  buildDevPreviewPreloadBindings,
} from "../handlers/devPreview.preload.js";
import { PLUGIN_METHOD_CHANNELS, buildPluginPreloadBindings } from "../handlers/plugin.preload.js";
import {
  SCRATCH_METHOD_CHANNELS,
  buildScratchPreloadBindings,
} from "../handlers/scratch/preload.js";
import { DEMO_METHOD_CHANNELS, buildDemoPreloadBindings } from "../handlers/demo.preload.js";

describe("leaf preload namespace bindings", () => {
  describe("METHOD_CHANNELS stay in sync with CHANNELS", () => {
    it("slashCommands matches", () => {
      expect(SLASH_COMMANDS_METHOD_CHANNELS.list).toBe(CHANNELS.SLASH_COMMANDS_LIST);
    });

    it("globalEnv matches", () => {
      expect(GLOBAL_ENV_METHOD_CHANNELS.get).toBe(CHANNELS.GLOBAL_ENV_GET);
      expect(GLOBAL_ENV_METHOD_CHANNELS.set).toBe(CHANNELS.GLOBAL_ENV_SET);
    });

    it("help matches", () => {
      expect(HELP_METHOD_CHANNELS.getFolderPath).toBe(CHANNELS.HELP_GET_FOLDER_PATH);
      expect(HELP_METHOD_CHANNELS.markTerminal).toBe(CHANNELS.HELP_MARK_TERMINAL);
      expect(HELP_METHOD_CHANNELS.unmarkTerminal).toBe(CHANNELS.HELP_UNMARK_TERMINAL);
    });

    it("accessibility matches", () => {
      expect(ACCESSIBILITY_METHOD_CHANNELS.getEnabled).toBe(CHANNELS.ACCESSIBILITY_GET_ENABLED);
    });

    it("eventInspector matches", () => {
      expect(EVENT_INSPECTOR_METHOD_CHANNELS.getEvents).toBe(CHANNELS.EVENT_INSPECTOR_GET_EVENTS);
      expect(EVENT_INSPECTOR_METHOD_CHANNELS.getFiltered).toBe(
        CHANNELS.EVENT_INSPECTOR_GET_FILTERED
      );
      expect(EVENT_INSPECTOR_METHOD_CHANNELS.clear).toBe(CHANNELS.EVENT_INSPECTOR_CLEAR);
    });

    it("commands matches", () => {
      expect(COMMANDS_METHOD_CHANNELS.list).toBe(CHANNELS.COMMANDS_LIST);
      expect(COMMANDS_METHOD_CHANNELS.get).toBe(CHANNELS.COMMANDS_GET);
      expect(COMMANDS_METHOD_CHANNELS.execute).toBe(CHANNELS.COMMANDS_EXECUTE);
      expect(COMMANDS_METHOD_CHANNELS.getBuilder).toBe(CHANNELS.COMMANDS_GET_BUILDER);
    });

    it("portal matches", () => {
      expect(PORTAL_METHOD_CHANNELS.create).toBe(CHANNELS.PORTAL_CREATE);
      expect(PORTAL_METHOD_CHANNELS.show).toBe(CHANNELS.PORTAL_SHOW);
      expect(PORTAL_METHOD_CHANNELS.hide).toBe(CHANNELS.PORTAL_HIDE);
      expect(PORTAL_METHOD_CHANNELS.resize).toBe(CHANNELS.PORTAL_RESIZE);
      expect(PORTAL_METHOD_CHANNELS.closeTab).toBe(CHANNELS.PORTAL_CLOSE_TAB);
      expect(PORTAL_METHOD_CHANNELS.navigate).toBe(CHANNELS.PORTAL_NAVIGATE);
      expect(PORTAL_METHOD_CHANNELS.goBack).toBe(CHANNELS.PORTAL_GO_BACK);
      expect(PORTAL_METHOD_CHANNELS.goForward).toBe(CHANNELS.PORTAL_GO_FORWARD);
      expect(PORTAL_METHOD_CHANNELS.reload).toBe(CHANNELS.PORTAL_RELOAD);
      expect(PORTAL_METHOD_CHANNELS.showNewTabMenu).toBe(CHANNELS.PORTAL_SHOW_NEW_TAB_MENU);
    });

    it("devPreview matches", () => {
      expect(DEV_PREVIEW_METHOD_CHANNELS.ensure).toBe(CHANNELS.DEV_PREVIEW_ENSURE);
      expect(DEV_PREVIEW_METHOD_CHANNELS.restart).toBe(CHANNELS.DEV_PREVIEW_RESTART);
      expect(DEV_PREVIEW_METHOD_CHANNELS.restartAndClearCache).toBe(
        CHANNELS.DEV_PREVIEW_RESTART_AND_CLEAR_CACHE
      );
      expect(DEV_PREVIEW_METHOD_CHANNELS.reinstallAndRestart).toBe(
        CHANNELS.DEV_PREVIEW_REINSTALL_AND_RESTART
      );
      expect(DEV_PREVIEW_METHOD_CHANNELS.stop).toBe(CHANNELS.DEV_PREVIEW_STOP);
      expect(DEV_PREVIEW_METHOD_CHANNELS.stopByPanel).toBe(CHANNELS.DEV_PREVIEW_STOP_BY_PANEL);
      expect(DEV_PREVIEW_METHOD_CHANNELS.getState).toBe(CHANNELS.DEV_PREVIEW_GET_STATE);
      expect(DEV_PREVIEW_METHOD_CHANNELS.getByWorktree).toBe(CHANNELS.DEV_PREVIEW_GET_BY_WORKTREE);
    });

    it("plugin matches (plugin:invoke intentionally excluded)", () => {
      expect(PLUGIN_METHOD_CHANNELS.list).toBe(CHANNELS.PLUGIN_LIST);
      expect(PLUGIN_METHOD_CHANNELS.toolbarButtons).toBe(CHANNELS.PLUGIN_TOOLBAR_BUTTONS);
      expect(PLUGIN_METHOD_CHANNELS.menuItems).toBe(CHANNELS.PLUGIN_MENU_ITEMS);
      expect(PLUGIN_METHOD_CHANNELS.validateActionIds).toBe(CHANNELS.PLUGIN_VALIDATE_ACTION_IDS);
      expect(PLUGIN_METHOD_CHANNELS.getActions).toBe(CHANNELS.PLUGIN_ACTIONS_GET);
      expect(PLUGIN_METHOD_CHANNELS.registerAction).toBe(CHANNELS.PLUGIN_ACTIONS_REGISTER);
      expect(PLUGIN_METHOD_CHANNELS.unregisterAction).toBe(CHANNELS.PLUGIN_ACTIONS_UNREGISTER);
      expect(PLUGIN_METHOD_CHANNELS.getPanelKinds).toBe(CHANNELS.PLUGIN_PANEL_KINDS_GET);
    });

    it("scratch matches", () => {
      expect(SCRATCH_METHOD_CHANNELS.getAll).toBe(CHANNELS.SCRATCH_GET_ALL);
      expect(SCRATCH_METHOD_CHANNELS.getCurrent).toBe(CHANNELS.SCRATCH_GET_CURRENT);
      expect(SCRATCH_METHOD_CHANNELS.create).toBe(CHANNELS.SCRATCH_CREATE);
      expect(SCRATCH_METHOD_CHANNELS.update).toBe(CHANNELS.SCRATCH_UPDATE);
      expect(SCRATCH_METHOD_CHANNELS.remove).toBe(CHANNELS.SCRATCH_REMOVE);
      expect(SCRATCH_METHOD_CHANNELS.switch).toBe(CHANNELS.SCRATCH_SWITCH);
      expect(SCRATCH_METHOD_CHANNELS.saveAsProject).toBe(CHANNELS.SCRATCH_SAVE_AS_PROJECT);
    });

    it("demo matches", () => {
      expect(DEMO_METHOD_CHANNELS.moveTo).toBe(CHANNELS.DEMO_MOVE_TO);
      expect(DEMO_METHOD_CHANNELS.moveToSelector).toBe(CHANNELS.DEMO_MOVE_TO_SELECTOR);
      expect(DEMO_METHOD_CHANNELS.click).toBe(CHANNELS.DEMO_CLICK);
      expect(DEMO_METHOD_CHANNELS.type).toBe(CHANNELS.DEMO_TYPE);
      expect(DEMO_METHOD_CHANNELS.screenshot).toBe(CHANNELS.DEMO_SCREENSHOT);
      expect(DEMO_METHOD_CHANNELS.waitForSelector).toBe(CHANNELS.DEMO_WAIT_FOR_SELECTOR);
      expect(DEMO_METHOD_CHANNELS.pause).toBe(CHANNELS.DEMO_PAUSE);
      expect(DEMO_METHOD_CHANNELS.resume).toBe(CHANNELS.DEMO_RESUME);
      expect(DEMO_METHOD_CHANNELS.sleep).toBe(CHANNELS.DEMO_SLEEP);
      expect(DEMO_METHOD_CHANNELS.scroll).toBe(CHANNELS.DEMO_SCROLL);
      expect(DEMO_METHOD_CHANNELS.drag).toBe(CHANNELS.DEMO_DRAG);
      expect(DEMO_METHOD_CHANNELS.pressKey).toBe(CHANNELS.DEMO_PRESS_KEY);
      expect(DEMO_METHOD_CHANNELS.spotlight).toBe(CHANNELS.DEMO_SPOTLIGHT);
      expect(DEMO_METHOD_CHANNELS.dismissSpotlight).toBe(CHANNELS.DEMO_DISMISS_SPOTLIGHT);
      expect(DEMO_METHOD_CHANNELS.annotate).toBe(CHANNELS.DEMO_ANNOTATE);
      expect(DEMO_METHOD_CHANNELS.dismissAnnotation).toBe(CHANNELS.DEMO_DISMISS_ANNOTATION);
      expect(DEMO_METHOD_CHANNELS.waitForIdle).toBe(CHANNELS.DEMO_WAIT_FOR_IDLE);
      expect(DEMO_METHOD_CHANNELS.startCapture).toBe(CHANNELS.DEMO_START_CAPTURE);
      expect(DEMO_METHOD_CHANNELS.stopCapture).toBe(CHANNELS.DEMO_STOP_CAPTURE);
      expect(DEMO_METHOD_CHANNELS.getCaptureStatus).toBe(CHANNELS.DEMO_GET_CAPTURE_STATUS);
    });
  });

  describe("slashCommands", () => {
    it("routes list() to slash-commands:list with the payload forwarded", async () => {
      const invoke = vi.fn().mockResolvedValue([]);
      const bindings = buildSlashCommandsPreloadBindings(invoke);

      const payload = { agentId: "claude", projectPath: "/tmp/p" } as const;
      await bindings.list(payload);

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("slash-commands:list", payload);
    });
  });

  describe("globalEnv", () => {
    it("routes get() to global-env:get with no args", async () => {
      const invoke = vi.fn().mockResolvedValue({});
      const bindings = buildGlobalEnvPreloadBindings(invoke);

      await bindings.get();

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("global-env:get");
    });

    it("wraps set(variables) into the { variables } payload required by the channel", async () => {
      const invoke = vi.fn().mockResolvedValue(undefined);
      const bindings = buildGlobalEnvPreloadBindings(invoke);

      const variables = { FOO: "bar", BAZ: "qux" };
      await bindings.set(variables);

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("global-env:set", { variables });
    });
  });

  describe("help", () => {
    it("routes getFolderPath() to help:get-folder-path with no args", async () => {
      const invoke = vi.fn().mockResolvedValue("/tmp/help");
      const bindings = buildHelpPreloadBindings(invoke);

      await bindings.getFolderPath();

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("help:get-folder-path");
    });

    it("routes markTerminal() to help:mark-terminal with the terminalId forwarded", async () => {
      const invoke = vi.fn().mockResolvedValue(undefined);
      const bindings = buildHelpPreloadBindings(invoke);

      await bindings.markTerminal("term-1");

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("help:mark-terminal", "term-1");
    });

    it("routes unmarkTerminal() to help:unmark-terminal with the terminalId forwarded", async () => {
      const invoke = vi.fn().mockResolvedValue(undefined);
      const bindings = buildHelpPreloadBindings(invoke);

      await bindings.unmarkTerminal("term-1");

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("help:unmark-terminal", "term-1");
    });
  });

  describe("accessibility", () => {
    it("routes getEnabled() to accessibility:get-enabled with no args", async () => {
      const invoke = vi.fn().mockResolvedValue(true);
      const bindings = buildAccessibilityPreloadBindings(invoke);

      await bindings.getEnabled();

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("accessibility:get-enabled");
    });
  });

  describe("eventInspector", () => {
    it("routes getEvents() to event-inspector:get-events with no args", async () => {
      const invoke = vi.fn().mockResolvedValue([]);
      const bindings = buildEventInspectorPreloadBindings(invoke);

      await bindings.getEvents();

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("event-inspector:get-events");
    });

    it("routes getFiltered(filters) to event-inspector:get-filtered with the filters forwarded", async () => {
      const invoke = vi.fn().mockResolvedValue([]);
      const bindings = buildEventInspectorPreloadBindings(invoke);

      const filters = { types: ["user-action"] };
      await bindings.getFiltered(filters);

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("event-inspector:get-filtered", filters);
    });

    it("routes clear() to event-inspector:clear with no args", async () => {
      const invoke = vi.fn().mockResolvedValue(undefined);
      const bindings = buildEventInspectorPreloadBindings(invoke);

      await bindings.clear();

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("event-inspector:clear");
    });
  });

  describe("commands", () => {
    it("routes list(context) to commands:list with the context forwarded", async () => {
      const invoke = vi.fn().mockResolvedValue([]);
      const bindings = buildCommandsPreloadBindings(invoke);

      const ctx = { projectId: "p1" } as const;
      await bindings.list(ctx);

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("commands:list", ctx);
    });

    it("routes execute(payload) to commands:execute with the payload forwarded", async () => {
      const invoke = vi.fn().mockResolvedValue({ success: true });
      const bindings = buildCommandsPreloadBindings(invoke);

      const payload = { commandId: "do-thing", context: {} };
      await bindings.execute(payload);

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("commands:execute", payload);
    });
  });

  describe("portal", () => {
    it("routes create(payload) to portal:create with the payload forwarded", async () => {
      const invoke = vi.fn().mockResolvedValue(undefined);
      const bindings = buildPortalPreloadBindings(invoke);

      const payload = { tabId: "t1", url: "https://example.com" };
      await bindings.create(payload);

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("portal:create", payload);
    });

    it("routes goBack(tabId) to portal:go-back with the tabId forwarded", async () => {
      const invoke = vi.fn().mockResolvedValue(true);
      const bindings = buildPortalPreloadBindings(invoke);

      await bindings.goBack("t1");

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("portal:go-back", "t1");
    });
  });

  describe("devPreview", () => {
    it("routes ensure(request) to dev-preview:ensure with the request forwarded", async () => {
      const invoke = vi.fn().mockResolvedValue({ status: "running" });
      const bindings = buildDevPreviewPreloadBindings(invoke);

      const request = {
        worktreeId: "wt1",
        projectId: "p1",
        panelId: "panel1",
        cwd: "/tmp/p",
        devCommand: "npm run dev",
      };
      await bindings.ensure(request);

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("dev-preview:ensure", request);
    });
  });

  describe("plugin", () => {
    it("routes list() to plugin:list with no args", async () => {
      const invoke = vi.fn().mockResolvedValue([]);
      const bindings = buildPluginPreloadBindings(invoke);

      await bindings.list();

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("plugin:list");
    });

    it("routes registerAction(pluginId, contribution) with both args forwarded", async () => {
      const invoke = vi.fn().mockResolvedValue(undefined);
      const bindings = buildPluginPreloadBindings(invoke);

      const contribution = {
        id: "act-1",
        title: "Do thing",
        description: "Does the thing",
        category: "general",
        kind: "command" as const,
        danger: "safe" as const,
      };
      await bindings.registerAction("plug-1", contribution);

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("plugin:actions-register", "plug-1", contribution);
    });
  });

  describe("scratch", () => {
    it("routes getAll() to scratch:get-all with no args", async () => {
      const invoke = vi.fn().mockResolvedValue([]);
      const bindings = buildScratchPreloadBindings(invoke);

      await bindings.getAll();

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("scratch:get-all");
    });

    it("routes update(scratchId, updates) with both args forwarded", async () => {
      const invoke = vi.fn().mockResolvedValue({});
      const bindings = buildScratchPreloadBindings(invoke);

      const updates = { name: "renamed" };
      await bindings.update("s1", updates);

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("scratch:update", "s1", updates);
    });
  });

  describe("demo", () => {
    it("routes click() to demo:click with no args", async () => {
      const invoke = vi.fn().mockResolvedValue(undefined);
      const bindings = buildDemoPreloadBindings(invoke);

      await bindings.click();

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("demo:click");
    });

    it("routes moveTo(payload) to demo:move-to with the payload forwarded", async () => {
      const invoke = vi.fn().mockResolvedValue(undefined);
      const bindings = buildDemoPreloadBindings(invoke);

      const payload = { x: 10, y: 20, durationMs: 100 };
      await bindings.moveTo(payload);

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("demo:move-to", payload);
    });
  });
});
