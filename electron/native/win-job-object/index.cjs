// Windows Job Object binding wrapper (#7526).
//
// Loads the compiled native addon on Windows and exposes a no-op shim
// elsewhere. The native addon ships source-only — `electron-rebuild`
// compiles it during `postinstall` on Windows, and the binding is skipped
// entirely on macOS / Linux (where this whole feature is out of scope).

"use strict";

let native = null;
let loadError = null;

if (process.platform === "win32") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    native = require("./build/Release/win_job_object.node");
  } catch (err) {
    loadError = err;
  }
}

function assignProcessToHelpJob(pid) {
  if (!native || typeof native.assignProcessToHelpJob !== "function") {
    return false;
  }
  if (typeof pid !== "number" || !Number.isFinite(pid) || !Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    return Boolean(native.assignProcessToHelpJob(pid));
  } catch {
    return false;
  }
}

function isAvailable() {
  return native !== null;
}

function getLoadError() {
  return loadError;
}

module.exports = {
  assignProcessToHelpJob,
  isAvailable,
  getLoadError,
};
