# Contributing

## Getting Started

1. Fork the repository
2. Clone your fork
3. Install dependencies: `npm install`
4. Create a feature branch: `git checkout -b feature/your-feature`
5. Make changes
6. Run checks: `npm run check`
7. Commit and push
8. Open a pull request

## Development Setup

See [Development Guide](development.md) for detailed setup instructions.

## Code Style

### TypeScript

- Use TypeScript for all new code
- Enable strict mode
- Prefer explicit types over `any`
- Use interfaces for object shapes, types for unions

### Formatting

Code is formatted with Prettier. Run before committing:

```bash
npm run format
```

ESLint enforces additional rules:

```bash
npm run lint
```

Or fix automatically:

```bash
npm run fix
```

### Comments

This project optimizes for AI tooling. Keep comments minimal:

- No decorative separator lines
- No redundant type documentation
- Document only non-obvious logic or edge cases
- Be terse and direct

### Commits

Use conventional commit format:

```
type(scope): description

[optional body]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:

```
feat(terminal): add bulk close action
fix(worktree): handle missing branch gracefully
docs(readme): update installation steps
```

## Pull Request Process

1. **Branch naming:** Use `feature/`, `fix/`, or `refactor/` prefixes
2. **Tests:** Add tests for new functionality
3. **Checks:** Ensure `npm run check` passes
4. **Description:** Explain what and why, not just how
5. **Review:** Address feedback promptly

## Architecture Guidelines

### Main vs Renderer

- **Main process:** System operations, native modules, file I/O
- **Renderer process:** UI only, no Node.js APIs

### IPC Patterns

- Define channels in `electron/ipc/channels.ts`
- Group related channels by namespace
- Always type IPC payloads

### State Management

- Use Zustand stores in `src/store/`
- Keep stores focused and small
- Prefer derived state over duplicated state

### Services

- Services live in `electron/services/`
- One responsibility per service
- Use the event bus for cross-service communication

## Keeping Docs in Sync

When making changes that affect documentation:

1. Update relevant doc files
2. Verify GitHub links still work
3. Keep examples current

## Questions

Open an issue for questions or discussions.
