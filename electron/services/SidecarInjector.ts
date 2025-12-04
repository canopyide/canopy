import type { WebContents } from "electron";
import { getServiceConfig, type ChatServiceConfig } from "../../shared/constants/chatSelectors.js";

export interface InjectionResult {
  success: boolean;
  error?: string;
}

export class SidecarInjector {
  async inject(webContents: WebContents, text: string): Promise<InjectionResult> {
    const url = webContents.getURL();
    const config = getServiceConfig(url);

    if (!config) {
      return { success: false, error: "Unknown chat service" };
    }

    try {
      const result = await this.executeInjection(webContents, text, config);
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Injection failed",
      };
    }
  }

  private async executeInjection(
    webContents: WebContents,
    text: string,
    config: ChatServiceConfig
  ): Promise<InjectionResult> {
    const escapedText = this.escapeForJs(text);
    const script = this.buildInjectionScript(escapedText, config);

    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("Injection timeout")), 5000);
    });

    const resultPromise = webContents.executeJavaScript(script).catch(() => ({
      success: false,
      error: "Script execution failed",
    }));

    try {
      const result = await Promise.race([resultPromise, timeoutPromise]);
      if (timeoutId) clearTimeout(timeoutId);
      return result;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      throw error;
    }
  }

  private buildInjectionScript(escapedText: string, config: ChatServiceConfig): string {
    const selectors = [config.inputSelector, ...config.fallbackSelectors]
      .map((s) => `'${s.replace(/'/g, "\\'")}'`)
      .join(", ");

    if (config.insertMethod === "contenteditable") {
      return `
        (function() {
          const selectors = [${selectors}];
          let input = null;

          for (const selector of selectors) {
            input = document.querySelector(selector);
            if (input) break;
          }

          if (!input) {
            return { success: false, error: 'Chat input not found' };
          }

          // Focus and scroll into view
          input.focus();
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });

          // For ProseMirror/contenteditable
          const text = ${escapedText};

          // Clear existing content
          input.innerHTML = '';

          // Insert text with proper line breaks
          const lines = text.split('\\n');
          lines.forEach((line, i) => {
            const textNode = document.createTextNode(line);
            input.appendChild(textNode);
            if (i < lines.length - 1) {
              input.appendChild(document.createElement('br'));
            }
          });

          // Dispatch events for React
          input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));

          return { success: true };
        })();
      `;
    } else {
      // For textarea/input elements
      return `
        (function() {
          const selectors = [${selectors}];
          let input = null;

          for (const selector of selectors) {
            input = document.querySelector(selector);
            if (input) break;
          }

          if (!input) {
            return { success: false, error: 'Chat input not found' };
          }

          input.focus();
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });

          const text = ${escapedText};

          // Set value using native setter to work with React
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value'
          )?.set;

          if (nativeInputValueSetter) {
            nativeInputValueSetter.call(input, text);
          } else {
            input.value = text;
          }

          // Dispatch events
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));

          // Auto-resize textarea if needed
          input.style.height = 'auto';
          input.style.height = input.scrollHeight + 'px';

          return { success: true };
        })();
      `;
    }
  }

  private escapeForJs(text: string): string {
    return JSON.stringify(text);
  }
}
