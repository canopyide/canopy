# E2E Testing

Daintree uses [Playwright](https://playwright.dev/) for end-to-end testing of the Electron app.

## Setup

Playwright is installed as a dev dependency (`@playwright/test`). No browser download is needed — tests launch the real Electron binary directly.

## Running Tests

```bash
npm run test:e2e              # Run all Playwright projects
npm run test:e2e:core         # Run lightweight release-gating core tests
npm run test:e2e:full         # Run broad deterministic full tests
npm run test:e2e:online       # Run Claude/OpenCode-dependent online tests
npm run test:e2e:nightly      # Run soak/leak nightly tests
npx playwright test --project=core -g "Worktree Lifecycle"  # Run a specific suite
PWDEBUG=1 npx playwright test --project=core       # Debug mode
```

## Test Suites

Tests are split into four projects:

- **core** — Lightweight deterministic release gate for essential app/project/terminal/persistence/agent coverage.
- **full** — Broad deterministic regression suite. This is intentionally heavy and is not run on Windows nightly.
- **online** — Tests that interact with real agent CLIs (requires `ANTHROPIC_API_KEY` for Claude).
- **nightly** — Long-running soak/leak tests.

## Configuration

`playwright.config.ts` at the project root defines the projects:

| Property     | Core         | Full         | Online         | Nightly         |
| ------------ | ------------ | ------------ | -------------- | --------------- |
| testDir      | `./e2e/core` | `./e2e/full` | `./e2e/online` | `./e2e/nightly` |
| retries (CI) | 2            | 2            | 1              | 0               |
| workers      | 1-2          | 1-2          | 1-2            | 1               |

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
├── core/
│   ├── core-first-run-onboarding.spec.ts
│   ├── core-persistence.spec.ts
│   ├── core-process-badge.spec.ts
│   ├── core-terminal-agent-promotion.spec.ts
│   └── core-worktree-lifecycle.spec.ts
├── full/
│   └── *.spec.ts                        # Broad deterministic UI, settings, layout, recovery, stress coverage
└── online/
    ├── claude-online.spec.ts
    ├── opencode-online.spec.ts
    └── terminal-identity-transitions.spec.ts
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

### `e2e-core.yml`

- **Triggers:** workflow_dispatch, workflow_call
- **Matrix:** macOS-14, ubuntu-22.04, windows-latest
- **No secrets needed**

### `e2e-online.yml`

- **Triggers:** workflow_dispatch, workflow_call
- **Requires:** `ANTHROPIC_API_KEY` secret
- **Nightly failure notification:** Creates/updates a GitHub issue labeled `e2e-nightly-failure`

### Release Gating

`release.yml` runs checks, unit tests, and all three e2e gates (`core`, `full`, `online`) before platform packaging starts. Release e2e gates run on non-Windows runners; Windows release confidence comes from the platform build/package smoke plus the lightweight Windows nightly core gate.

### Cross-Platform Matrix

| Platform | Runner                     | Notes                          |
| -------- | -------------------------- | ------------------------------ |
| macOS    | `macos-14` (Apple Silicon) | No extra setup                 |
| Linux    | `ubuntu-22.04`             | `xvfb-run` for virtual display |
| Windows  | `windows-latest`           | No xvfb needed                 |

### Platform-Specific Electron Flags

`e2e/helpers/launch.ts` adds flags when `CI=true` on Linux:

- `--no-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`
