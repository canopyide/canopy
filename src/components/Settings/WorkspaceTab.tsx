import { TerminalSettingsTab } from "./TerminalSettingsTab";
import { WorktreeSettingsTab } from "./WorktreeSettingsTab";
import { ToolbarSettingsTab } from "./ToolbarSettingsTab";

export function WorkspaceTab() {
  return (
    <div className="space-y-8">
      <section id="workspace-panel-grid">
        <h2 className="text-base font-semibold text-canopy-text mb-4 scroll-mt-4">Panel Grid</h2>
        <TerminalSettingsTab />
      </section>

      <hr className="border-canopy-border" />

      <section id="workspace-worktree">
        <h2 className="text-base font-semibold text-canopy-text mb-4 scroll-mt-4">
          Worktree Paths
        </h2>
        <WorktreeSettingsTab />
      </section>

      <hr className="border-canopy-border" />

      <section id="workspace-toolbar">
        <h2 className="text-base font-semibold text-canopy-text mb-4 scroll-mt-4">Toolbar</h2>
        <ToolbarSettingsTab />
      </section>
    </div>
  );
}
