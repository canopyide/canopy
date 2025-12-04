export interface ChatServiceConfig {
  name: string;
  domains: string[];
  inputSelector: string;
  fallbackSelectors: string[];
  submitSelector?: string;
  insertMethod: "contenteditable" | "value" | "clipboard";
  preInjectionScript?: string;
}

export const CHAT_SERVICES: ChatServiceConfig[] = [
  {
    name: "Claude",
    domains: ["claude.ai"],
    inputSelector: '[contenteditable="true"].ProseMirror',
    fallbackSelectors: [
      '.ProseMirror[contenteditable="true"]',
      '[data-placeholder="How can Claude help you today?"]',
    ],
    submitSelector: 'button[aria-label="Send Message"]',
    insertMethod: "contenteditable",
  },
  {
    name: "ChatGPT",
    domains: ["chatgpt.com", "chat.openai.com"],
    inputSelector: "#prompt-textarea",
    fallbackSelectors: ['textarea[data-id="root"]', 'textarea[placeholder*="Send a message"]'],
    submitSelector: 'button[data-testid="send-button"]',
    insertMethod: "value",
  },
  {
    name: "Gemini",
    domains: ["gemini.google.com"],
    inputSelector: '.ql-editor[contenteditable="true"]',
    fallbackSelectors: [
      '[contenteditable="true"][aria-label*="message"]',
      '.input-area [contenteditable="true"]',
    ],
    submitSelector: 'button[aria-label="Send message"]',
    insertMethod: "contenteditable",
  },
];

export function getServiceConfig(url: string): ChatServiceConfig | null {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:") {
      return null;
    }
    const hostname = parsedUrl.hostname;
    return (
      CHAT_SERVICES.find((s) =>
        s.domains.some((d) => hostname === d || hostname.endsWith(`.${d}`))
      ) ?? null
    );
  } catch {
    return null;
  }
}
