import { GitHubSettingsTab } from "./GitHubSettingsTab";
import { EditorIntegrationTab } from "./EditorIntegrationTab";
import { ImageViewerTab } from "./ImageViewerTab";
import { SidecarSettingsTab } from "./SidecarSettingsTab";
import { McpServerSettingsTab } from "./McpServerSettingsTab";

export function IntegrationsTab() {
  return (
    <div className="space-y-8">
      <section id="integrations-github">
        <h2 className="text-base font-semibold text-canopy-text mb-4 scroll-mt-4">GitHub</h2>
        <GitHubSettingsTab />
      </section>

      <hr className="border-canopy-border" />

      <section id="integrations-editor">
        <h2 className="text-base font-semibold text-canopy-text mb-4 scroll-mt-4">Editor</h2>
        <EditorIntegrationTab />
      </section>

      <hr className="border-canopy-border" />

      <section id="integrations-image-viewer">
        <h2 className="text-base font-semibold text-canopy-text mb-4 scroll-mt-4">Image Viewer</h2>
        <ImageViewerTab />
      </section>

      <hr className="border-canopy-border" />

      <section id="integrations-sidecar">
        <h2 className="text-base font-semibold text-canopy-text mb-4 scroll-mt-4">Sidecar</h2>
        <SidecarSettingsTab />
      </section>

      <hr className="border-canopy-border" />

      <section id="integrations-mcp">
        <h2 className="text-base font-semibold text-canopy-text mb-4 scroll-mt-4">MCP Server</h2>
        <McpServerSettingsTab />
      </section>
    </div>
  );
}
