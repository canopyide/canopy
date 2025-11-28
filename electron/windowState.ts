import { BrowserWindow, screen } from 'electron';
import { store } from './store.js';

function debounce<T extends (...args: any[]) => void>(func: T, wait: number): T {
  let timeout: NodeJS.Timeout | null = null;
  return ((...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  }) as T;
}

export function createWindowWithState(options: Electron.BrowserWindowConstructorOptions): BrowserWindow {
  const windowState = store.get('windowState');

  // Create window with saved state
  const win = new BrowserWindow({
    ...options,
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
  });

  // Restore maximized state
  if (windowState.isMaximized) {
    win.maximize();
  }

  // Validate position is on a visible display with significant visible area
  const bounds = win.getBounds();
  const display = screen.getDisplayMatching(bounds);

  // Check if window is mostly visible (at least 50% on screen)
  if (!display || bounds.width <= 0 || bounds.height <= 0) {
    win.center();
  } else {
    const workArea = display.workArea;
    const visibleWidth = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x);
    const visibleHeight = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y);
    const visibleArea = Math.max(0, visibleWidth) * Math.max(0, visibleHeight);
    const totalArea = bounds.width * bounds.height;

    if (visibleArea < totalArea * 0.5) {
      win.center();
    }
  }

  // Track last normal bounds for maximized state
  let lastNormalBounds = { x: windowState.x, y: windowState.y, width: windowState.width, height: windowState.height };

  // Save state on changes
  const saveState = () => {
    if (win.isDestroyed()) return;

    const isMaximized = win.isMaximized();
    const currentBounds = win.getBounds();

    // Update last normal bounds when not maximized
    if (!isMaximized) {
      lastNormalBounds = { ...currentBounds };
    }

    store.set('windowState', {
      x: lastNormalBounds.x,
      y: lastNormalBounds.y,
      width: lastNormalBounds.width,
      height: lastNormalBounds.height,
      isMaximized,
    });
  };

  // Debounce state saves to reduce disk writes
  const debouncedSaveState = debounce(saveState, 500);

  win.on('resize', debouncedSaveState);
  win.on('move', debouncedSaveState);
  win.on('close', saveState); // Save immediately on close

  return win;
}
