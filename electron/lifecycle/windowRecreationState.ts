// Set true while the OOM crash handler is destroying a window and awaiting its
// async recreation. `BrowserWindow.destroy()` synchronously emits
// `window-all-closed`, which on Linux/Windows would otherwise unconditionally
// fire `app.quit()` before the new window is registered — quitting the app
// mid-recreate. Callers must clear it via `setWindowRecreating(false)` in a
// `.finally()` so a rejected recreation cannot strand the flag and silently
// suppress legitimate user-driven quits.
let _isWindowRecreating = false;

export const isWindowRecreating = (): boolean => _isWindowRecreating;
export const setWindowRecreating = (value: boolean): void => {
  _isWindowRecreating = value;
};
