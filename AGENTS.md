# Repository Guidelines

## Project Structure

- `src/`: React 19 UI (components, hooks, Zustand stores, entry `main.tsx`/`App.tsx`).
- `electron/`: Main process (IPC handlers, preload, services).
- `docs/`: Product/feature specs.
- Tests: `__tests__` folders beside source files.

## Commands

```bash
npm run dev              # Vite UI + Electron main
npm run build            # Full production build
npm test                 # Vitest
npm run check            # typecheck + lint + format
npm run fix              # Auto-fix lint/format
```

## Critical Rules

1. **Dependencies:** Use `npm install`, never `npm ci` (package-lock is ignored).
2. **Code Style:** Minimal comments, no decorative separators, high signal-to-noise.
3. **Commits:** Conventional Commits (`feat(scope):`, `fix(scope):`, `chore:`).
4. **PRs:** Include brief summary, key changes, linked issues. Run `npm run check` first.
5. **Security:** No secrets in commits. Validate IPC inputs. Type all main/renderer boundaries.

## Coding Standards

- TypeScript everywhere. Explicit types for public APIs and IPC.
- Prettier: 2-space, double quotes, semicolons, trailing commas (es5), width 100.
- ESLint: React hooks rules, unused vars prefixed `_`, prefer `as const`.
- Components/hooks: `PascalCase`. Functions/vars: `camelCase`. Constants: `SCREAMING_SNAKE_CASE`.

## Testing

- Framework: Vitest. Files: `*.test.ts`/`*.test.tsx` in `__tests__/`.
- Mock IPC/process in tests. No network calls.
- Run `npm run test:watch` during dev, `npm test` before submit.
