const { execSync } = require("child_process");

// `win-job-object` is a Windows-only N-API addon (#7526). Its binding.gyp
// emits zero targets on macOS / Linux, so electron-rebuild succeeds with no
// .node file produced — the wrapper handles the missing-binary case.
execSync("electron-rebuild -f -w node-pty,better-sqlite3,win-job-object", { stdio: "inherit" });
require("../node_modules/node-pty/scripts/post-install.js");
