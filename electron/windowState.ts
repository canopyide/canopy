import { BrowserWindow, screen } from "electron";
import { store } from "./store.js";

function debounce<T extends (...args: any[]) => void>(func: T, wait: number): T {
  let timeout: NodeJS.Timeout | null = null;
  return ((...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  }) as T;
}

export function createWindowWithState(
  options: Electron.BrowserWindowConstructorOptions
): BrowserWindow {
  const windowState = store.get("windowState");

  const win = new BrowserWindow({
    ...options,
    ...(windowState.x !== undefined && { x: windowState.x }),
    ...(windowState.y !== undefined && { y: windowState.y }),
    width: windowState.width,
    height: windowState.height,
  });

  if (windowState.isMaximized) {
    win.maximize();
  }

  const bounds = win.getBounds();
  const display = screen.getDisplayMatching(bounds);

  // Check if window is mostly visible (at least 50% on screen)
  if (
    !display ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    windowState.x === undefined ||
    windowState.y === undefined
  ) {
    win.center();
  } else {
    const workArea = display.workArea;
    const visibleWidth =
      Math.min(bounds.x + bounds.width, workArea.x + workArea.width) -
      Math.max(bounds.x, workArea.x);
    const visibleHeight =
      Math.min(bounds.y + bounds.height, workArea.y + workArea.height) -
      Math.max(bounds.y, workArea.y);
    const visibleArea = Math.max(0, visibleWidth) * Math.max(0, visibleHeight);
    const totalArea = bounds.width * bounds.height;

    if (visibleArea < totalArea * 0.5) {
      win.center();
    }
  }

  let lastNormalBounds = {
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
  };

  const saveState = () => {
    if (win.isDestroyed()) return;

    const isMaximized = win.isMaximized();
    const currentBounds = win.getBounds();

    if (!isMaximized) {
      lastNormalBounds = { ...currentBounds };
    }

    store.set("windowState", {
      x: lastNormalBounds.x,
      y: lastNormalBounds.y,
      width: lastNormalBounds.width,
      height: lastNormalBounds.height,
      isMaximized,
    });
  };

  const debouncedSaveState = debounce(saveState, 500);

  win.on("resize", debouncedSaveState);
  win.on("move", debouncedSaveState);
  win.on("close", saveState);

  return win;
}
