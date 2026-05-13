<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cdn.daintree.org/brand/wordmark-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://cdn.daintree.org/brand/wordmark-light.svg">
    <img alt="Daintree" src="https://cdn.daintree.org/brand/wordmark-dark.svg" width="280">
  </picture>
</p>

<p align="center"><strong>A habitat for your AI coding agents.</strong></p>

<p align="center">
  Multiple agents working side by side — isolated, observable, and under your control.
</p>

<p align="center">
  <a href="https://github.com/daintreehq/daintree/releases"><img alt="Release" src="https://img.shields.io/github/v/release/daintreehq/daintree?style=flat-square"></a>&nbsp;
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square"></a>&nbsp;
  <a href="https://github.com/daintreehq/daintree/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/daintreehq/daintree/ci.yml?branch=develop&style=flat-square"></a>&nbsp;
  <a href="https://github.com/daintreehq/daintree/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/daintreehq/daintree?style=social"></a>
</p>

<p align="center">
  <img alt="Daintree desktop — four agents working in parallel, Daintree theme on the left half and Hokkaido on the right" src="https://cdn.daintree.org/screenshots/latest/hero-v2.webp">
</p>

## Install

Get Daintree for **[macOS](https://daintree.org/download)**, **[Windows](https://daintree.org/download)**, or **[Linux](https://daintree.org/download)** — all on the same page. macOS ships as a signed-and-notarized DMG (arm64, x64, universal); Linux as AppImage and `.deb`; Windows as a sideloadable `.appx` package while the Microsoft Store listing is in review. Homebrew and winget recipes are in the oven.

<p align="center">
  <a href="https://daintree.org/download"><img alt="Download Daintree for macOS, Windows, or Linux" src="https://cdn.daintree.org/brand/download-button-v2.svg" width="340"></a>
</p>

## The problem

- **Agent fatigue.** Five terminals, three agents, no idea who's stuck.
- **Worktree sprawl.** Each agent wants its own branch — managing five at once is its own job.
- **Review is the bottleneck.** Generation is fast; supervising what came back is what eats the day.

Daintree is the macro-orchestration layer for this workflow. [Read the full vision →](docs/vision.md)

## Works with

Claude Code, Gemini CLI, Codex, GitHub Copilot CLI, Cursor, Aider, OpenCode, Goose, Crush, Qwen Code, Open Interpreter, Mistral Vibe, Kimi Code, Kiro, and Amp.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cdn.daintree.org/brand/agents-row-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://cdn.daintree.org/brand/agents-row-light.png">
    <img alt="Supported agents" src="https://cdn.daintree.org/brand/agents-row-dark.png" width="900">
  </picture>
</p>

## Features

- **Fleet Broadcasting** — One prompt, N agents. Armed-target filtering, live drafting preview, per-agent customization.
- **Daintree Assistant** — In-app help that reads agent state. Backed by Claude, Gemini, Codex, Copilot CLI, or Gemini CLI.
- **Worktree Dashboard** — Every branch in one view. Auto PR/issue detection, dev-server lifecycle, commit composer.
- **Context Injection** — Select files, ship structured context into any agent's terminal. Built on [CopyTree](https://github.com/gregpriday/copytree).
- **MCP Server** — Agents invoke Daintree actions directly. Per-tier authorization, audit log, idempotency.
- **Action Palette · 14 themes** — 300+ keyboard-first actions. Palette-based theme system with accessibility tokens.
- **Notification Center** — Agents run unattended; the inbox surfaces what needs you and what can wait.
- **Voice input** — OpenAI Realtime-backed dictation for quick prompts (optional, requires an API key).

> A feature grid with screenshots ships in the next pass once captures are finalized.

## Getting started

### Prerequisites

- **Node.js** v22+
- **Git** v2.30+

### Install

```bash
git clone https://github.com/daintreehq/daintree.git
cd daintree
npm install
npm run dev
```

The `postinstall` script rebuilds native modules (`node-pty`) for Electron automatically. If you see PTY errors, run `npm run rebuild`.

For AI features, open **Settings** (bottom-left sidebar) to configure your GitHub token and per-agent defaults.

### Install agent CLIs

Daintree works with any agent you have installed. The Settings → Agents tab lists every supported agent with a one-click installer for your platform; the commands below are the canonical recipes for reference.

**npm (cross-platform):**

```bash
npm install -g @anthropic-ai/claude-code    # Claude Code
npm install -g @google/gemini-cli           # Gemini CLI
npm install -g @openai/codex                # Codex
npm install -g opencode-ai@latest           # OpenCode
npm install -g @github/copilot              # GitHub Copilot CLI
npm install -g @qwen-code/qwen-code         # Qwen Code
npm install -g @sourcegraph/amp             # Amp
```

**Shell installer (macOS/Linux):**

```bash
curl https://cursor.com/install -fsS | bash                                                     # Cursor Agent
curl -fsSL https://cli.kiro.dev/install | bash                                                  # Kiro
curl -fsSL https://opencode.ai/install | bash                                                   # OpenCode
curl -fsSL https://ampcode.com/install.sh | bash                                                # Amp
curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | bash       # Goose
curl -LsSf https://mistral.ai/vibe/install.sh | bash                                            # Mistral Vibe
curl -LsSf https://aider.chat/install.sh | sh                                                   # Aider
```

**Other ecosystems:**

```bash
brew install charmbracelet/tap/crush        # Crush (Homebrew)
go install github.com/charmbracelet/crush@latest  # Crush (Go)
uv tool install kimi-cli                    # Kimi Code (uv)
uv tool install open-interpreter            # Open Interpreter (uv)
pipx install aider-chat                     # Aider (pipx)
```

## Documentation

- [Architecture](docs/architecture/) — System design, IPC patterns, terminal lifecycle
- [Development guide](docs/development.md) — Setup, debugging, contribution workflow
- [Theme system](docs/themes/theme-system.md) — Theme pipeline, tokens, and runtime
- [E2E testing](docs/e2e-testing.md) — Playwright testing setup and patterns
- [Release process](docs/release.md) — Versioning and release workflow

## License

Apache 2.0. See [LICENSE](LICENSE) and [TRADEMARKS.md](TRADEMARKS.md) for the brand and marks policy.

<p align="center">
  <a href="https://daintree.org">Website</a>  ·  
  <a href="docs/architecture/">Architecture</a>  ·  
  <a href="https://github.com/daintreehq/daintree/issues">Issues</a>
</p>
