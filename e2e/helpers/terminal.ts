import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { SEL } from "./selectors";
import { T_SHORT } from "./timeouts";

type TerminalBridge = {
  getInfo?: (terminalId: string) => Promise<{ hasPty?: boolean } | null | undefined>;
  setActivityTier?: (terminalId: string, tier: "active" | "background") => void;
  wake?: (terminalId: string) => Promise<{ state: string | null; warnings?: string[] }>;
  write?: (terminalId: string, data: string) => void;
  submit?: (terminalId: string, text: string) => Promise<void>;
};

async function getPanelId(panelLocator: Locator): Promise<string> {
  return panelLocator.evaluate((el) => {
    const panel = el.closest("[data-panel-id]");
    return panel?.getAttribute("data-panel-id") ?? "";
  });
}

export async function getTerminalText(panelLocator: Locator): Promise<string> {
  const page = panelLocator.page();
  const panelId = await getPanelId(panelLocator);

  if (!panelId) return "";

  // Try buffer API first (works with all renderers including WebGL)
  const bufferText = await page.evaluate((id) => {
    const reader = (window as unknown as Record<string, unknown>).__daintreeReadTerminalBuffer;
    if (typeof reader === "function") return reader(id) as string;
    return null;
  }, panelId);

  if (bufferText !== null) return bufferText;

  // Fallback: read DOM text (only works with DOM renderer)
  return panelLocator.locator(SEL.terminal.xtermRows).innerText();
}

export async function waitForTerminalText(
  panelLocator: Locator,
  text: string,
  timeout = 60_000
): Promise<void> {
  await expect
    .poll(() => getTerminalText(panelLocator), { timeout, intervals: [200, 500, 1000] })
    .toContain(text);
}

export async function waitForTerminalPty(
  page: Page,
  panelLocator: Locator,
  timeout = 10_000
): Promise<void> {
  const panelId = await getPanelId(panelLocator);
  if (!panelId) throw new Error("Could not resolve panel ID for terminal PTY");

  await expect
    .poll(
      () =>
        page.evaluate(async (id) => {
          const api = (
            window as unknown as {
              electron?: { terminal?: TerminalBridge };
            }
          ).electron?.terminal;
          if (typeof api?.getInfo !== "function") return false;
          try {
            const info = await api.getInfo(id);
            return info?.hasPty === true;
          } catch {
            return false;
          }
        }, panelId),
      { timeout, intervals: [100, 250, 500] }
    )
    .toBe(true);
}

export async function waitForTerminalReady(
  page: Page,
  panelLocator: Locator,
  timeout = 10_000
): Promise<void> {
  await waitForTerminalPty(page, panelLocator, timeout);

  await expect
    .poll(
      async () => {
        const text = await getTerminalText(panelLocator);
        return text.trim().length > 0;
      },
      { timeout, intervals: [100, 250, 500] }
    )
    .toBe(true);
}

async function activateTerminal(page: Page, panelId: string): Promise<void> {
  await page.evaluate(async (id) => {
    const api = (
      window as unknown as {
        electron?: { terminal?: TerminalBridge };
      }
    ).electron?.terminal;

    if (typeof api?.wake === "function") {
      await api.wake(id);
      return;
    }

    api?.setActivityTier?.(id, "active");
  }, panelId);
}

export async function writeTerminalInput(
  page: Page,
  panelLocator: Locator,
  data: string
): Promise<void> {
  const panelId = await getPanelId(panelLocator);
  if (!panelId) throw new Error("Could not resolve panel ID for terminal input");

  await waitForTerminalPty(page, panelLocator);
  await activateTerminal(page, panelId);

  const wrote = await page.evaluate(
    ({ id, input }) => {
      const api = (
        window as unknown as {
          electron?: { terminal?: TerminalBridge };
        }
      ).electron?.terminal;
      if (typeof api?.write !== "function") return false;
      api.write(id, input);
      return true;
    },
    { id: panelId, input: data }
  );

  if (!wrote) throw new Error(`terminal.write bridge unavailable for panel ${panelId}`);
}

export async function runTerminalCommand(
  page: Page,
  panelLocator: Locator,
  command: string
): Promise<void> {
  await expect(panelLocator).toBeVisible({ timeout: 5_000 });
  const panelId = await getPanelId(panelLocator);
  if (!panelId) throw new Error("Could not resolve panel ID for terminal command");

  await waitForTerminalReady(page, panelLocator);
  await activateTerminal(page, panelId);

  const payload = command.endsWith("\n") ? command : `${command}\n`;
  const submitted = await page.evaluate(
    async ({ id, input }) => {
      const api = (
        window as unknown as {
          electron?: { terminal?: TerminalBridge };
        }
      ).electron?.terminal;
      if (typeof api?.submit !== "function") return false;
      await api.submit(id, input);
      return true;
    },
    { id: panelId, input: payload }
  );

  if (!submitted) {
    await writeTerminalInput(page, panelLocator, `${command}\r`);
  }
}

export async function getTerminalBufferLength(panelLocator: Locator): Promise<number> {
  const page = panelLocator.page();
  const panelId = await getPanelId(panelLocator);
  if (!panelId) return 0;

  return page.evaluate((id) => {
    const fn = (window as unknown as Record<string, unknown>).__daintreeGetTerminalBufferLength;
    if (typeof fn === "function") return fn(id) as number;
    return 0;
  }, panelId);
}

export async function selectAllTerminalText(panelLocator: Locator): Promise<void> {
  const page = panelLocator.page();
  const panelId = await getPanelId(panelLocator);
  if (!panelId) throw new Error("Could not resolve panel ID for selectAll");
  const ok = await page.evaluate((id) => {
    const fn = (window as unknown as Record<string, unknown>).__daintreeSelectTerminalAll;
    if (typeof fn === "function") return fn(id) as boolean;
    return false;
  }, panelId);
  if (!ok) throw new Error(`selectAllTerminalText failed for panel ${panelId}`);
}

export async function triggerTerminalLink(panelLocator: Locator, url: string): Promise<string> {
  const page = panelLocator.page();
  const panelId = await getPanelId(panelLocator);
  if (!panelId) return "missing-panel";
  return page.evaluate(
    ({ id, linkUrl }) => {
      const fn = (window as unknown as Record<string, unknown>).__daintreeTriggerTerminalLink;
      if (typeof fn === "function") return fn(id, linkUrl) as string;
      return "missing-bridge";
    },
    { id: panelId, linkUrl: url }
  );
}

export async function openTerminalContextMenu(panelLocator: Locator): Promise<void> {
  const page = panelLocator.page();
  const xterm = panelLocator.locator(SEL.terminal.xtermRows);
  await xterm.click({ button: "right" });
  await expect(page.locator(SEL.contextMenu.content)).toBeVisible({ timeout: T_SHORT });
}
