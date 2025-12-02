# Repository Guidelines

Use this guide to get productive quickly and keep contributions consistent.

## Project Structure & Module Organization

- `src/`: React 19 + TypeScript UI (components, hooks, Zustand `store/`, shared `lib/` + `utils/`, entry `main.tsx` / `App.tsx`).
- `electron/`: Main-process code, IPC handlers, preload scripts, and services.
- `docs/`: Product and feature specs; reference before shipping user-facing changes.
- `dist/`, `dist-electron/`: Build outputs (ignored from review noise).
- Tests live beside code under `__tests__` (e.g., `src/hooks/__tests__`, `electron/services/__tests__`).

## Build, Test, and Development Commands

- `npm run dev`: Runs Vite UI + Electron main in parallel for local development.
- `npm run dev:vite` / `npm run dev:electron`: Start either side independently.
- `npm run build`: Type-checks, builds the renderer via Vite, and compiles Electron entry points.
- `npm run package[:mac|:win|:linux]`: Build distributables with electron-builder.
- `npm test` / `npm run test:watch` / `npm run test:ui`: Vitest in run, watch, or UI mode.
- `npm run lint` / `npm run lint:fix`: ESLint for TS/React/Hooks rules.
- `npm run format` / `npm run format:check`: Prettier formatting.
- `npm run typecheck`: No-emit type safety for renderer + Electron preload/main.

## Coding Style & Naming Conventions

- TypeScript everywhere; favor explicit types for public APIs and IPC contracts.
- Prettier settings: 2-space indent, double quotes, semicolons, trailing commas (es5), width 100.
- ESLint: React hooks rules enforced; unused vars allowed when prefixed `_`; prefer `as const`.
- Components/hooks in `PascalCase`, functions/vars in `camelCase`, constants in `SCREAMING_SNAKE_CASE`.
- Keep side-effects out of shared utils; prefer pure helpers and typed return values.

## Code Commenting Guidelines

**Optimize for Token Efficiency**

This project is AI-first. Comments must be minimal to preserve the context window.

- **No Decoration:** Strictly avoid decorative separator lines (e.g., `=====`, `-----`) or block framing.
- **Be Terse:** Use direct, brief language. Avoid conversational filler.
- **High Signal:** Only document non-obvious logic, complex rationale, or edge cases.
- **No Redundancy:** Do not restate information that is already obvious from variable names or types.

## Testing Guidelines

- Framework: Vitest. Test files end with `.test.ts`/`.test.tsx` inside `__tests__` folders near source.
- Add focused unit tests for new hooks, stores, and Electron services; mock IPC/process where possible.
- Aim for coverage on new logic and regressions; keep tests deterministic (no network calls).
- Use `npm run test:watch` during feature work; run `npm test` before submitting.

## Commit & Pull Request Guidelines

- Use Conventional Commits mirroring history (`feat(scope): ...`, `fix(scope): ...`, `chore: ...`).
- Keep commits scoped and readable; include rationale in body when behavior changes.
- PRs: brief summary of intent, list key changes, link issues, and attach screenshots or screen recordings for UI updates.
- Confirm `npm run check` (typecheck + lint + format:check) and `npm test` are clean before requesting review.

## Security & Configuration Tips

- Do not commit secrets (API keys for AI providers, tokens). Prefer env vars or local Electron Store.
- Check `docs/` for feature-specific requirements before enabling new integrations.
- When touching IPC, validate inputs and keep renderer-main boundaries typed to avoid unsafe channels.
