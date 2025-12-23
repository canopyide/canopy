/**
 * Built-in panel component registrations.
 * Called once at app startup to register terminal, agent, and browser panels.
 */
import { registerPanelComponent } from "./panelComponentRegistry";
import { TerminalPane } from "@/components/Terminal/TerminalPane";
import { BrowserPane } from "@/components/Browser/BrowserPane";
import { NotesPanel } from "@/components/Notes/NotesPanel";
import { GitActivityPanel } from "@/components/Git/GitActivityPanel";

// Registration flag to prevent double registration
let registered = false;

/**
 * Register all built-in panel components.
 * Safe to call multiple times - only registers once.
 */
export function registerBuiltInPanelComponents(): void {
  if (registered) return;
  registered = true;

  // Terminal panel - plain terminal sessions
  registerPanelComponent("terminal", {
    component: TerminalPane,
  });

  // Agent panel - AI agent sessions (Claude, Gemini, etc.)
  // Uses same component as terminal, distinguished by agentId prop
  registerPanelComponent("agent", {
    component: TerminalPane,
  });

  // Browser panel - localhost iframe browser
  registerPanelComponent("browser", {
    component: BrowserPane,
  });

  // Notes panel - markdown scratchpad
  registerPanelComponent("notes", {
    component: NotesPanel,
  });

  // Git Activity panel - commit timeline and activity feed
  registerPanelComponent("git-activity", {
    component: GitActivityPanel,
  });
}
