// Counts in-flight OOM window recreations. `BrowserWindow.destroy()` emits
// `window-all-closed` synchronously, which on Linux/Windows would otherwise
// fire `app.quit()` before the replacement window is registered — quitting the
// app mid-recreate. Each OOM handler increments before `destroy()` and
// decrements in a `.finally()` after the recreation promise settles. Using a
// counter (not a boolean) keeps the guard correct when two windows recreate
// concurrently in a multi-window session — a boolean's first `.finally()`
// would otherwise clear the flag while the other recreate is still in flight.
let _inFlightCount = 0;

export const isWindowRecreating = (): boolean => _inFlightCount > 0;

export const beginWindowRecreating = (): void => {
  _inFlightCount += 1;
};

export const endWindowRecreating = (): void => {
  if (_inFlightCount > 0) _inFlightCount -= 1;
};
