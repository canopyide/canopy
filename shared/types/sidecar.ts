export type SidecarLayoutMode = "push" | "overlay";

export type SidecarLinkType = "system" | "discovered" | "user";

export interface SidecarLink {
  id: string;
  title: string;
  url: string;
  icon: string;
  type: SidecarLinkType;
  enabled: boolean;
  order: number;
  cliDetector?: string;
  alwaysEnabled?: boolean;
}

export interface LinkTemplate {
  title: string;
  url: string;
  icon: string;
  cliDetector?: string;
  alwaysEnabled?: boolean;
}

export const LINK_TEMPLATES: Record<string, LinkTemplate> = {
  claude: {
    title: "Claude",
    url: "https://claude.ai/new",
    icon: "claude",
    cliDetector: "claude",
  },
  chatgpt: {
    title: "ChatGPT",
    url: "https://chatgpt.com/",
    icon: "openai",
    cliDetector: "openai",
  },
  gemini: {
    title: "Gemini",
    url: "https://gemini.google.com/app",
    icon: "gemini",
    cliDetector: "gemini",
  },
  localhost: {
    title: "Localhost",
    url: "http://localhost:3000",
    icon: "globe",
    alwaysEnabled: true,
  },
  google: {
    title: "Google",
    url: "https://www.google.com",
    icon: "search",
  },
};

export interface SidecarTab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
}

export interface SidecarBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SidecarNavEvent {
  tabId: string;
  title: string;
  url: string;
}

export interface SidecarCreatePayload {
  tabId: string;
  url: string;
}

export interface SidecarShowPayload {
  tabId: string;
  bounds: SidecarBounds;
}

export interface SidecarCloseTabPayload {
  tabId: string;
}

export interface SidecarNavigatePayload {
  tabId: string;
  url: string;
}

export const DEFAULT_SIDECAR_TABS: SidecarTab[] = [
  { id: "claude", url: "https://claude.ai/new", title: "Claude" },
  { id: "chatgpt", url: "https://chatgpt.com/", title: "ChatGPT" },
  { id: "localhost", url: "http://localhost:3000", title: "Localhost" },
  { id: "google", url: "https://www.google.com", title: "Google" },
];

export const SIDECAR_MIN_WIDTH = 400;
export const SIDECAR_MAX_WIDTH = 1200;
export const SIDECAR_DEFAULT_WIDTH = 800;
export const MIN_GRID_WIDTH = 600;
