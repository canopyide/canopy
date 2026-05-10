# E2E Testing

Daintree uses [Playwright](https://playwright.dev/) for end-to-end testing of the Electron app.

## Setup

Playwright is installed as a dev dependency (`@playwright/test`). No browser download is needed — tests launch the real Electron binary directly.

## Running Tests

```bash
npm run test:e2e                   # Run every Playwright project
npm run test:e2e:core              # Lightweight release-gating smoke
npm run test:e2e:full              # Run all six full-* buckets
npm run test:e2e:full-terminal     # Run a single bucket — substitute any of:
                                   #   full-terminal full-worktree full-presets
                                   #   full-platform full-panels full-resilience
npm run test:e2e:online            # Claude/OpenCode-dependent online tests
npm run test:e2e:nightly           # Soak / memory-leak nightly tests
npx playwright test e2e/full/terminal/core-terminal-search.spec.ts  # Single file
PWDEBUG=1 npx playwright test --project=core                         # Debug mode
```

## Test Suites

Tests are split into nine Playwright projects:

- **core** — Lightweight deterministic release-gate smoke (5 specs).
- **full-terminal** — PTY mechanics, scrollback, search, layout, recipes, output flood, context injection, fleet broadcast.
- **full-worktree** — Worktree lifecycle, project switching, git detection, cross-project flows.
- **full-presets** — Agent presets, recipes, onboarding, CCR.
- **full-platform** — Settings, persistence, a11y, keyboard, OS-shell surfaces, oauth, security.
- **full-panels** — Browser, dev-preview, portal, review hub, file viewer, drag-drop, action palette, toolbar chrome.
- **full-resilience** — Errors, IPC, crashes, races, perf budgets, diagnostics.
- **online** — Tests that interact with real agent CLIs (requires `ANTHROPIC_API_KEY`).
- **nightly** — Long-running memory-leak detection (workers=1, no retries).

## Configuration

`playwright.config.ts` at the project root defines the projects. All `full-*` buckets share `coreTimeout` and `retries: 2 (CI)`. `core` and `online` keep their own timeouts; `nightly` runs at workers=1 with no retries.

| Project         | testDir                 | retries (CI) | workers |
| --------------- | ----------------------- | ------------ | ------- |
| core            | `./e2e/core`            | 2            | 1-2     |
| full-terminal   | `./e2e/full/terminal`   | 2            | 1-2     |
| full-worktree   | `./e2e/full/worktree`   | 2            | 1-2     |
| full-presets    | `./e2e/full/presets`    | 2            | 1-2     |
| full-platform   | `./e2e/full/platform`   | 2            | 1-2     |
| full-panels     | `./e2e/full/panels`     | 2            | 1-2     |
| full-resilience | `./e2e/full/resilience` | 2            | 1-2     |
| online          | `./e2e/online`          | 1            | 1-2     |
| nightly         | `./e2e/nightly`         | 0            | 1       |

## Directory Structure

```text
e2e/
├── helpers/
│   ├── selectors.ts     # Centralized SEL constants for all test selectors
│   ├── launch.ts        # launchApp(), mockOpenDialog(), AppContext
│   ├── fixtures.ts      # createFixtureRepo(), createFixtureRepos()
│   ├── project.ts       # openProject(), completeOnboarding(), openAndOnboardProject()
│   ├── terminal.ts      # getTerminalText(), waitForTerminalText(), runTerminalCommand()
│   └── panels.ts        # getFirstGridPanel(), getGridPanelCount(), getDockPanelCount()
├── core/                # 5 smoke specs (release gate)
│   └── core-*.spec.ts
├── full/
│   ├── terminal/        # 15 specs — PTY mechanics
│   ├── worktree/        # 11 specs — worktree, project, git
│   ├── presets/         # 17 specs — agent presets, recipes
│   ├── platform/        # 17 specs — settings, persistence, a11y, oauth
│   ├── panels/          # 16 specs — browser, dev-preview, portal, review hub
│   └── resilience/      # 18 specs — errors, IPC, crashes, races, perf
├── online/              # 3 agent-integration specs (release gate)
│   └── *-online.spec.ts
└── nightly/             # 2 memory-leak specs (nightly only)
    └── nightly-*.spec.ts
```

## Shared Helpers

### Selectors (`e2e/helpers/selectors.ts`)

All test selectors are centralized in the `SEL` object. When a UI element's `aria-label` or `data-testid` changes, update it in one place:

```ts
import { SEL } from "../helpers/selectors";

await window.locator(SEL.toolbar.openSettings).click();
await window.locator(SEL.worktree.card("main")).click();
```

### Launch Helper (`e2e/helpers/launch.ts`)

`launchApp()` creates an isolated temp user-data directory, launches Electron, and waits for the toolbar to be ready. Returns `AppContext { app, window, userDataDir }`.

### Fixtures (`e2e/helpers/fixtures.ts`)

`createFixtureRepo()` creates a temporary git repo with options for multiple files and feature branches. `createFixtureRepos(n)` creates N named repos.

### Project Helper (`e2e/helpers/project.ts`)

`openAndOnboardProject()` combines dialog mocking, folder opening, and onboarding wizard completion.

### Terminal Helper (`e2e/helpers/terminal.ts`)

`runTerminalCommand()` clicks the xterm area, types the command, and presses Enter. `waitForTerminalText()` polls via `expect.poll()`.

## Working with xterm.js Terminals

xterm.js v6 uses the **DOM renderer** by default. Terminal output is rendered in `.xterm-rows`, making it readable via Playwright locators.

### Reading terminal output

```ts
const panel = getFirstGridPanel(page);
const text = await getTerminalText(panel);
```

### Typing into the HybridInputBar

The HybridInputBar uses CodeMirror 6 (contenteditable div). Use `pressSequentially` with a small delay:

```ts
const cmEditor = agentPanel.locator(".cm-content");
await cmEditor.click();
await cmEditor.pressSequentially("your command here", { delay: 30 });
await window.keyboard.press("Enter");
```

### Gotchas

- **Multiple `.xterm-rows` elements**: Scope locators to the specific panel container.
- **`fill()` doesn't work on CodeMirror**: Use `pressSequentially()` on `.cm-content`.
- **False positive text matching**: The typed command appears in terminal output too.

## Data Test IDs

Components have `data-testid` and `data-worktree-branch` attributes for reliable test targeting. See `e2e/helpers/selectors.ts` for the full list.

## CI Workflows

### `e2e.yml` (unified runner)

A single reusable workflow runs every E2E suite. Pick one via the `suite` input: `full` (meta — all six buckets sequentially on one runner; workflow_dispatch default), `core`, any of the six `full-*` buckets (`full-terminal`, `full-worktree`, `full-presets`, `full-platform`, `full-panels`, `full-resilience`), `online`, or `nightly`.

- **Triggers:** workflow_dispatch, workflow_call
- **Matrix:** macOS-14, ubuntu-22.04, windows-latest (selectable via `platform`)
- **Single-file runs:** pass `test_file: e2e/full/<bucket>/foo.spec.ts` and set `suite` to the bucket that owns that path (workflow_dispatch).
- **Conditional behaviour by suite:**
  - `full` — expands to six `--project=full-*` flags on a single runner. Use this for ad-hoc validation; release and nightly fan the buckets out across separate runners instead.
  - `online` — extra `npm install -g opencode-ai`. Caller MUST use `secrets: inherit` so `ANTHROPIC_API_KEY` is reachable.
  - `nightly` — Playwright is invoked with `--workers=1` (the memory-leak heuristic depends on serialized launches).
  - All others — no extra steps.

### `e2e-single.yml` (debugging helper)

A separate workflow for fine-grained ad-hoc runs of a single test file with configurable `workers`, `retries`, and an optional `--grep` pattern. Routes through `scripts/ci/run-single-e2e.mjs`, which validates that the spec path matches the chosen project. Use this when iterating on a flaky test in CI.

### Release Gating

`release.yml` runs checks, unit tests, and the e2e gates (`core` + the six `full-*` buckets fanned out as a matrix + `online`) before platform packaging starts. Release e2e gates run on non-Windows runners; Windows release confidence comes from the platform build/package smoke plus full Windows nightly coverage. Nightly runs every E2E project — core, all six `full-*` buckets, online, and the memory-leak `nightly` project — across all three operating systems.

### Cross-Platform Matrix

| Platform | Runner                     | Notes                          |
| -------- | -------------------------- | ------------------------------ |
| macOS    | `macos-14` (Apple Silicon) | No extra setup                 |
| Linux    | `ubuntu-22.04`             | `xvfb-run` for virtual display |
| Windows  | `windows-latest`           | No xvfb needed                 |

### Platform-Specific Electron Flags

`e2e/helpers/launch.ts` adds flags when `CI=true` on Linux:

- `--no-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`
