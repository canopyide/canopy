import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactCompiler from "eslint-plugin-react-compiler";
import unicorn from "eslint-plugin-unicorn";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended rules
  ...tseslint.configs.recommended,

  // Downgrade new ESLint 10 recommended rules to warnings (ratcheted)
  {
    rules: {
      "no-useless-assignment": "warn",
      "preserve-caught-error": "warn",
    },
  },

  // React Hooks configuration
  {
    files: ["**/*.{tsx,jsx,ts}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      // React Hooks rules
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // TypeScript-specific rules
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // Allow unused vars prefixed with underscore
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // Allow explicit any for now (can tighten later)
      "@typescript-eslint/no-explicit-any": "warn",

      // Allow non-null assertions (common in Electron IPC)
      "@typescript-eslint/no-non-null-assertion": "off",

      // Allow empty functions (common for cleanup callbacks)
      "@typescript-eslint/no-empty-function": "off",

      // Prefer const assertions
      "@typescript-eslint/prefer-as-const": "error",
    },
  },

  // Electron main process specific rules
  {
    files: ["electron/**/*.ts"],
    rules: {
      // Console is allowed in main process
      "no-console": "off",
    },
  },

  // Layering rules - prevent architecture violations
  {
    files: ["src/store/**/*.ts"],
    rules: {
      // Stores should not import IPC clients directly - use controllers
      "no-restricted-imports": [
        "warn",
        {
          paths: [
            {
              name: "@/clients/terminalClient",
              message:
                "Store files should not import IPC clients directly. Use controllers to encapsulate IPC calls.",
            },
          ],
          patterns: [
            {
              group: ["@/clients"],
              message:
                "Store files should not import IPC clients directly. Use controllers to encapsulate IPC calls.",
            },
          ],
        },
      ],
    },
  },

  // React Compiler — surface bailout patterns
  {
    files: ["**/*.{tsx,jsx,ts}"],
    plugins: {
      "react-compiler": reactCompiler,
    },
    rules: {
      "react-compiler/react-compiler": "warn",
    },
  },

  // Expiring TODOs — new `TODO [>=X.Y.Z]: ...` syntax fails lint once the
  // package version catches up. Uses bracket syntax so it does not collide
  // with existing `TODO(0.9.0)` parenthesis-format comments owned by #5150.
  {
    files: ["**/*.{ts,tsx,js,jsx,cts,mts}"],
    plugins: {
      unicorn,
    },
    rules: {
      "unicorn/expiring-todo-comments": ["error", { ignoreDatesOnPullRequests: true }],
    },
  },

  // Ban the ad-hoc `err instanceof Error ? err.message : <fallback>` ternary —
  // use formatErrorMessage(err, "domain fallback") from shared/utils/errorMessage
  // so every call site supplies its own operation-specific fallback string.
  // See issue #5845.
  // Also ban `void window.electron.X()` — fire-and-forget IPC must route
  // through safeFireAndForget so rejections reach reportRendererGlobalError
  // with call-site context. See issue #6029.
  // Also ban bare `dangerouslySetInnerHTML` — Trusted Types CSP requires the
  // `__html` value to be a `TrustedHTML` from the daintree-svg policy. See
  // issue #6392.
  // Note: the renderer block below re-declares no-restricted-syntax at "warn"
  // level for src/** with additional selectors. That block's array is the
  // effective set for src/ files, so it must keep these selectors in sync.
  // Renderer-only selectors (notify({type:"error",priority:"low"}) — #6885;
  // Math.random in template literals; magic setTimeout/setInterval delays)
  // intentionally live ONLY in the renderer block since their call sites are
  // renderer-only — duplicating into the global block would add no coverage.
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ConditionalExpression[test.type='BinaryExpression'][test.operator='instanceof'][test.right.name='Error'][consequent.type='MemberExpression'][consequent.property.name='message']",
          message:
            "Use formatErrorMessage(err, 'operation-specific fallback') from @shared/utils/errorMessage instead of the inline `instanceof Error ? .message : ...` ternary.",
        },
        {
          // why: real IPC calls are `void window.electron.namespace.method()`
          // at any depth. Constraining to `> MemberExpression :has(...)`
          // restricts the descendant search to the callee chain so this
          // doesn't false-positive on `void (async () => { await
          // window.electron.X() })()` IIFE patterns where window.electron
          // appears in the function body, not the callee.
          selector:
            "UnaryExpression[operator='void'] > CallExpression > MemberExpression:has(MemberExpression[object.name='window'][property.name='electron'])",
          message:
            "Don't use `void window.electron.X()` for fire-and-forget IPC — wrap the promise in safeFireAndForget(promise, { context }) from @/utils/safeFireAndForget so rejections reach reportRendererGlobalError with call-site context.",
        },
        {
          // Block raw `error.message` / `err.message` / `e.message` /
          // `result.error.message` inside notify({...}) /
          // addNotification({...}) message properties. These calls go to
          // user-facing toasts; raw library messages leak jargon (paths,
          // errno strings, internal source IDs). Use humanizeAppError()
          // from @shared/utils/errorMessage instead.
          //
          // The selector must match both bare-identifier calls
          // (`notify({...})`) and member-call patterns
          // (`useNotificationStore.getState().addNotification({...})`),
          // hence the `:matches()` over `callee.name` and
          // `callee.property.name`. The inner MemberExpression matches both
          // single-hop (`error.message`) and tail-of-chain (`x.error.message`).
          // See issue #6050.
          selector:
            "CallExpression:matches([callee.name=/^(notify|addNotification)$/], [callee.property.name=/^(notify|addNotification)$/]) ObjectExpression > Property[key.name='message'] MemberExpression[property.name='message']:matches([object.name=/^(error|err|e)$/], [object.property.name=/^(error|err|e)$/])",
          message:
            "Don't pipe raw error.message into user-facing notifications. Use humanizeAppError(error) from @shared/utils/errorMessage to produce a friendly title and body, and stash the raw message in a 'Copy details' action. See #6050.",
        },
        {
          // why: Trusted Types CSP (`require-trusted-types-for 'script'`)
          // means `dangerouslySetInnerHTML.__html` must be a `TrustedHTML`
          // produced by the `daintree-svg` policy, not a raw string. The
          // selector requires SOME CallExpression in the value (lint-level
          // ratchet — the runtime CSP is the actual security boundary, and
          // a stricter `callee.name='createTrustedHTML'` check breaks under
          // re-exports / aliasing). See #6392.
          selector:
            "JSXAttribute[name.name='dangerouslySetInnerHTML'] > JSXExpressionContainer > ObjectExpression > Property[key.name='__html']:not(:has(CallExpression))",
          message:
            "Pass __html through createTrustedHTML(value) from @/lib/trustedTypesPolicy instead of a raw string. See #6392.",
        },
      ],
    },
  },

  // Panel-kind literal-compare guardrail — ratchets on shared/ and electron/
  // at warn level. src/ coverage lives in the renderer hygiene block below
  // (also warn, to keep the ratchet consistent across the tree).
  //
  // This block also replicates the 4 global no-restricted-syntax selectors
  // (instanceof Error ternary, void window.electron, raw error.message in
  // notify, dangerouslySetInnerHTML) because flat config is last-write-wins
  // per rule — without them the global error-level selectors are silently
  // dropped for shared/ and electron/ files.
  // See #7672.
  {
    files: ["shared/**/*.{ts,tsx}", "electron/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "ConditionalExpression[test.type='BinaryExpression'][test.operator='instanceof'][test.right.name='Error'][consequent.type='MemberExpression'][consequent.property.name='message']",
          message:
            "Use formatErrorMessage(err, 'operation-specific fallback') from @shared/utils/errorMessage instead of the inline `instanceof Error ? .message : ...` ternary.",
        },
        {
          // why: real IPC calls are `void window.electron.namespace.method()`
          // at any depth. Constraining to `> MemberExpression :has(...)`
          // restricts the descendant search to the callee chain so this
          // doesn't false-positive on `void (async () => { await
          // window.electron.X() })()` IIFE patterns where window.electron
          // appears in the function body, not the callee.
          selector:
            "UnaryExpression[operator='void'] > CallExpression > MemberExpression:has(MemberExpression[object.name='window'][property.name='electron'])",
          message:
            "Don't use `void window.electron.X()` for fire-and-forget IPC — wrap the promise in safeFireAndForget(promise, { context }) from @/utils/safeFireAndForget so rejections reach reportRendererGlobalError with call-site context.",
        },
        {
          // Block raw `error.message` / `err.message` / `e.message` /
          // `result.error.message` inside notify({...}) /
          // addNotification({...}) message properties. These calls go to
          // user-facing toasts; raw library messages leak jargon (paths,
          // errno strings, internal source IDs). Use humanizeAppError()
          // from @shared/utils/errorMessage instead.
          //
          // The selector must match both bare-identifier calls
          // (`notify({...})`) and member-call patterns
          // (`useNotificationStore.getState().addNotification({...})`),
          // hence the `:matches()` over `callee.name` and
          // `callee.property.name`. The inner MemberExpression matches both
          // single-hop (`error.message`) and tail-of-chain (`x.error.message`).
          // See issue #6050.
          selector:
            "CallExpression:matches([callee.name=/^(notify|addNotification)$/], [callee.property.name=/^(notify|addNotification)$/]) ObjectExpression > Property[key.name='message'] MemberExpression[property.name='message']:matches([object.name=/^(error|err|e)$/], [object.property.name=/^(error|err|e)$/])",
          message:
            "Don't pipe raw error.message into user-facing notifications. Use humanizeAppError(error) from @shared/utils/errorMessage to produce a friendly title and body, and stash the raw message in a 'Copy details' action. See #6050.",
        },
        {
          // why: Trusted Types CSP (`require-trusted-types-for 'script'`)
          // means `dangerouslySetInnerHTML.__html` must be a `TrustedHTML`
          // produced by the `daintree-svg` policy, not a raw string. The
          // selector requires SOME CallExpression in the value (lint-level
          // ratchet — the runtime CSP is the actual security boundary, and
          // a stricter `callee.name='createTrustedHTML'` check breaks under
          // re-exports / aliasing). See #6392.
          selector:
            "JSXAttribute[name.name='dangerouslySetInnerHTML'] > JSXExpressionContainer > ObjectExpression > Property[key.name='__html']:not(:has(CallExpression))",
          message:
            "Pass __html through createTrustedHTML(value) from @/lib/trustedTypesPolicy instead of a raw string. See #6392.",
        },
        {
          // why: direct literal compares (kind === "browser") bypass the
          // panel-kind registry and silently diverge when capability flags
          // change. Use registry helpers (panelKindHasPty, etc.) or the
          // sanctioned type guards (isPtyPanel, isBrowserPanel,
          // isDevPreviewPanel) from @shared/types/panel. See #7672.
          selector:
            "BinaryExpression[operator=/^(!==|===)$/]:matches([left.name='kind'], [left.property.name='kind'])[right.type='Literal'][right.value=/^(terminal|browser|dev-preview)$/]",
          message:
            "Don't compare panel.kind against string literals. Use registry helpers (panelKindHasPty, panelKindCanRestart) or sanctioned type guards (isPtyPanel, isBrowserPanel, isDevPreviewPanel) from @shared/types/panel. See #7672.",
        },
      ],
    },
  },

  // Catch un-awaited promises in renderer code. `safeFireAndForget` is the
  // sanctioned escape hatch for fire-and-forget IPC — see issue #6029.
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // why: ratcheting plan from #6029 — start at `warn` to surface the
      // remaining bare orphan promise calls (settings hydrators, lazy
      // preloads, store actions) without breaking CI, then ratchet to
      // `error` once the codebase is swept. `ignoreVoid: true` keeps the
      // explicit `void X()` escape hatch available for non-IPC fire-and-
      // forget; `no-restricted-syntax` above bans `void window.electron.*`
      // at error so IPC calls are forced through `safeFireAndForget`.
      "@typescript-eslint/no-floating-promises": [
        "warn",
        {
          ignoreVoid: true,
          allowForKnownSafeCalls: [{ from: "file", name: "safeFireAndForget" }],
        },
      ],
    },
  },

  // Renderer hygiene ratchets — typed rules require a project-aware parser so
  // we scope `projectService` to `src/**` (electron/ has its own tsconfig and
  // would error out under this parser). Issue #5975.
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Force structured logger usage in the renderer. console.warn is allowed
      // for breadcrumbs that don't need IPC; bootstrap/error-fallback paths
      // suppress with `// eslint-disable-next-line no-console` and a comment.
      "no-console": ["error", { allow: ["warn"] }],

      // Flag narrowing assertions (`value as Foo` where value is any/unknown).
      // Broadening assertions (`value as unknown`) are still allowed.
      "@typescript-eslint/no-unsafe-type-assertion": "warn",

      // Renderer-scoped no-restricted-syntax. Flat-config is last-write-wins per
      // rule, so this array fully overrides the global block above for src/
      // files — selectors from the global block are repeated here to preserve
      // coverage, plus renderer-only selectors for Math.random IDs and magic
      // numeric setTimeout/setInterval delays.
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "ConditionalExpression[test.type='BinaryExpression'][test.operator='instanceof'][test.right.name='Error'][consequent.type='MemberExpression'][consequent.property.name='message']",
          message:
            "Use formatErrorMessage(err, 'operation-specific fallback') from @shared/utils/errorMessage instead of the inline `instanceof Error ? .message : ...` ternary.",
        },
        {
          selector:
            "UnaryExpression[operator='void'] > CallExpression > MemberExpression:has(MemberExpression[object.name='window'][property.name='electron'])",
          message:
            "Don't use `void window.electron.X()` for fire-and-forget IPC — wrap the promise in safeFireAndForget(promise, { context }) from @/utils/safeFireAndForget so rejections reach reportRendererGlobalError with call-site context.",
        },
        {
          selector:
            "CallExpression:matches([callee.name=/^(notify|addNotification)$/], [callee.property.name=/^(notify|addNotification)$/]) ObjectExpression > Property[key.name='message'] MemberExpression[property.name='message']:matches([object.name=/^(error|err|e)$/], [object.property.name=/^(error|err|e)$/])",
          message:
            "Don't pipe raw error.message into user-facing notifications. Use humanizeAppError(error) from @shared/utils/errorMessage to produce a friendly title and body, and stash the raw message in a 'Copy details' action. See #6050.",
        },
        {
          // why: type:"error" + priority:"low" silently drops the error
          // into the history inbox with no toast — users won't see it. If
          // the failure is diagnostic-only (user can still finish their
          // current task) demote to console.warn; if users need to see it,
          // remove priority:"low" or raise to "high"/"normal". Direct-child
          // combinator inside :has() prevents false positives from nested
          // sub-objects (e.g. context payloads). Literal-only match — the
          // computed-priority pattern in useErrors.ts is intentionally out
          // of scope. See #6885.
          selector:
            "CallExpression:matches([callee.name=/^(notify|addNotification)$/], [callee.property.name=/^(notify|addNotification)$/]) > ObjectExpression:has(> Property[key.name='type'][value.value='error']):has(> Property[key.name='priority'][value.value='low'])",
          message:
            'Don\'t emit low-priority error notifications. Use console.warn for diagnostic-only failures (user can still finish their task), or remove priority:"low" so the error toasts. See #6885.',
        },
        {
          // why: type:"error" notifications without an action leave users with
          // no recovery path — they're shouting "something broke" with no
          // next step. Title-Message-Action is the CLAUDE.md contract. If the
          // surrounding UI is itself the recovery surface (form stays open,
          // user can retry from within the page) annotate with
          // `// eslint-disable-next-line no-restricted-syntax -- notify-no-action: ok`
          // so the deliberate choice is documented. Direct-child combinator
          // inside :has() matches the priority:"low" rule pattern above and
          // prevents false positives from nested sub-objects. Known gap: a
          // spread-only action (`notify({ type:"error", ...recovery })` where
          // `recovery` includes `action`) will false-positive — refactor to
          // an inline `action:` property at the call site if you hit it. See
          // #8097.
          selector:
            "CallExpression:matches([callee.name=/^(notify|addNotification)$/], [callee.property.name=/^(notify|addNotification)$/]) > ObjectExpression:has(> Property[key.name='type'][value.value='error']):not(:has(> Property[key.name='action'])):not(:has(> Property[key.name='actions']))",
          message:
            "Action-free error notification. Either wire an action: { label, onClick } (Title-Message-Action contract), or annotate with `// eslint-disable-next-line no-restricted-syntax -- notify-no-action: ok` when the surrounding UI is itself the recovery surface. See #8097.",
        },
        {
          selector:
            "JSXAttribute[name.name='dangerouslySetInnerHTML'] > JSXExpressionContainer > ObjectExpression > Property[key.name='__html']:not(:has(CallExpression))",
          message:
            "Pass __html through createTrustedHTML(value) from @/lib/trustedTypesPolicy instead of a raw string. See #6392.",
        },
        {
          selector:
            "TemplateLiteral CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message:
            "Don't construct IDs from `Math.random()` inside template literals. Use crypto.randomUUID() (or a deterministic counter in tests) — Math.random() collides and isn't cryptographically random.",
        },
        {
          selector:
            "CallExpression[callee.type='Identifier'][callee.name=/^(setTimeout|setInterval)$/][arguments.1.type='Literal'][arguments.1.value>0]",
          message:
            "Avoid magic numeric delays. Hoist the value into a named constant (e.g. `const FLUSH_INTERVAL_MS = 200`) so the intent is documented at the call site.",
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(setTimeout|setInterval)$/][arguments.1.type='Literal'][arguments.1.value>0]",
          message:
            "Avoid magic numeric delays. Hoist the value into a named constant (e.g. `const FLUSH_INTERVAL_MS = 200`) so the intent is documented at the call site.",
        },
        {
          // why: direct literal compares (kind === "browser") bypass the
          // panel-kind registry and silently diverge when capability flags
          // change. Use registry helpers (panelKindHasPty, etc.) or the
          // sanctioned type guards (isPtyPanel, isBrowserPanel,
          // isDevPreviewPanel) from @shared/types/panel. See #7672.
          selector:
            "BinaryExpression[operator=/^(!==|===)$/]:matches([left.name='kind'], [left.property.name='kind'])[right.type='Literal'][right.value=/^(terminal|browser|dev-preview)$/]",
          message:
            "Don't compare panel.kind against string literals. Use registry helpers (panelKindHasPty, panelKindCanRestart) or sanctioned type guards (isPtyPanel, isBrowserPanel, isDevPreviewPanel) from @shared/types/panel. See #7672.",
        },
      ],
    },
  },

  // Logger module is the fallback console sink — its console.* calls are
  // intentional and must be allowed.
  {
    files: ["src/utils/logger.ts"],
    rules: {
      "no-console": "off",
    },
  },

  // Renderer import discipline — bans heavy bundle-cost packages from being
  // statically imported into the eager graph, plus the long-standing
  // electron-module ban (previously scoped to src/components/**, broadened
  // here to src/** since flat config is last-write-wins per rule and merging
  // the two restrictions avoids silently clobbering the electron guard). The
  // per-file override blocks below allowlist the small set of files where the
  // static import is genuinely required today; those overrides disable the
  // rule entirely for the scoped files, which is the only flat-config
  // mechanism since arrays don't merge.
  //
  // Pair with the renderer-import budget gate (scripts/check-renderer-import-budget.mjs)
  // which catches new chunks slipping into the eager closure even when the
  // lint rule is silenced by an allowlist entry. See issue #7659.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          paths: [
            {
              name: "@uiw/react-codemirror",
              message:
                "Heavy package — lazy-load via React.lazy() or dynamic import to keep the renderer eager graph trim. If a static import is genuinely required, add this file to the per-file override allowlist in eslint.config.js. See #7659.",
            },
            {
              name: "framer-motion",
              message:
                "Heavy package — lazy-load via React.lazy() or dynamic import. Animation features are already split via loadMotionFeatures(); prefer that pattern. See #7659.",
            },
            {
              name: "react-diff-view",
              message: "Heavy package — lazy-load via React.lazy() or dynamic import. See #7659.",
            },
          ],
          patterns: [
            {
              group: ["@radix-ui/*"],
              message:
                "Heavy package — wrap radix primitives in lazy-loaded components or compose them inside an already lazy boundary. See #7659.",
            },
            {
              group: ["@codemirror/*"],
              message:
                "Heavy package — codemirror modules should sit behind a lazy boundary (terminal input editor and file viewer are the canonical eager call sites; add new files to the allowlist if a static import is genuinely required). See #7659.",
            },
            {
              group: ["electron/**", "**/electron/**"],
              message: "Renderer code should not import from electron main process modules.",
            },
          ],
        },
      ],
    },
  },

  // Allowlist — framer-motion animation infrastructure and root App bootstrap.
  // App.tsx mounts LazyMotion + MotionConfig; motionFeatures.ts is the lazy
  // feature loader; animationUtils.ts exports the shared timing constants.
  {
    files: ["src/App.tsx", "src/lib/motionFeatures.ts", "src/lib/animationUtils.ts"],
    rules: { "no-restricted-imports": "off" },
  },

  // Allowlist — framer-motion drag-and-drop chrome (eager grid layout).
  {
    files: ["src/components/DragDrop/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": "off" },
  },

  // Allowlist — framer-motion panel tab list animations.
  {
    files: [
      "src/components/Panel/PanelTabList.tsx",
      "src/components/Panel/SortableTabButton.tsx",
      "src/components/Panel/TabButton.tsx",
    ],
    rules: { "no-restricted-imports": "off" },
  },

  // Allowlist — framer-motion content grid animations (terminal layout).
  {
    files: [
      "src/components/Terminal/ContentGridDefault.tsx",
      "src/components/Terminal/ContentGridFleetScope.tsx",
      "src/components/Terminal/useContentGridContext.tsx",
    ],
    rules: { "no-restricted-imports": "off" },
  },

  // Allowlist — framer-motion GitHub, Fleet, Layout chrome.
  {
    files: [
      "src/components/GitHub/BulkActionBar.tsx",
      "src/components/GitHub/CommitList.tsx",
      "src/components/GitHub/GitHubResourceList.tsx",
      "src/components/Fleet/FleetArmingRibbon.tsx",
      "src/components/Layout/DockedTabGroup.tsx",
    ],
    rules: { "no-restricted-imports": "off" },
  },

  // Allowlist — framer-motion onboarding/setup surfaces.
  {
    files: [
      "src/components/Onboarding/**/*.{ts,tsx}",
      "src/components/Setup/AgentSetupWizard.tsx",
      "src/components/Setup/SystemRequirementsSection.tsx",
      "src/components/Worktree/WorktreeCard/WorktreeDetailsSection.tsx",
      "src/hooks/app/useGettingStartedChecklist.ts",
    ],
    rules: { "no-restricted-imports": "off" },
  },

  // Allowlist — codemirror terminal input editor and its hook tree.
  {
    files: [
      "src/components/Terminal/HybridInputBar.tsx",
      "src/components/Terminal/hooks/**/*.{ts,tsx}",
      "src/components/Terminal/inputEditorExtensions/**/*.{ts,tsx}",
      "src/store/terminalInputStore.ts",
    ],
    rules: { "no-restricted-imports": "off" },
  },

  // Allowlist — codemirror file viewer and demo cursor.
  {
    files: [
      "src/components/FileViewer/CodeViewer.tsx",
      "src/components/FileViewer/codeMirrorLanguages.ts",
      "src/components/FileViewer/editorSearchTheme.ts",
      "src/components/Demo/DemoCursor.tsx",
    ],
    rules: { "no-restricted-imports": "off" },
  },

  // Allowlist — react-diff-view file viewer and worktree diff.
  {
    files: [
      "src/components/FileViewer/FileViewerModal.tsx",
      "src/components/Worktree/DiffViewer.tsx",
    ],
    rules: { "no-restricted-imports": "off" },
  },

  // Allowlist — radix-ui UI primitives (button, popover, tooltip, etc.) and
  // their direct consumers.
  {
    files: [
      "src/components/ui/button.tsx",
      "src/components/ui/context-menu.tsx",
      "src/components/ui/dropdown-menu.tsx",
      "src/components/ui/popover.tsx",
      "src/components/ui/select.tsx",
      "src/components/ui/tooltip.tsx",
      "src/components/Fleet/FleetPickerContent.tsx",
      "src/components/Settings/DiagnosticsReviewDialog.tsx",
      "src/components/Settings/SettingsCheckbox.tsx",
      "src/components/Settings/SettingsSwitch.tsx",
    ],
    rules: { "no-restricted-imports": "off" },
  },

  // Allowlist — test files exercising heavy-package components. Tests
  // legitimately import the package directly to assert behavior; the
  // production lazy-boundary discipline is enforced on the component, not the
  // test.
  {
    files: ["src/**/__tests__/**/*.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    rules: { "no-restricted-imports": "off" },
  },

  // Prettier must be last to override conflicting rules
  prettier,

  // Global ignores
  {
    ignores: [
      "dist/**",
      "dist-electron/**",
      "dist-typecheck/**",
      "release/**",
      "node_modules/**",
      "*.config.js",
      "*.config.cjs",
      // why: knip.config.ts is a tooling file not covered by any project
      // tsconfig. Scope the TS-config ignore narrowly so vite/vitest/
      // playwright configs remain linted.
      "knip.config.ts",
      "scripts/**",
      "build/**",
      "public/**",
      ".claude/**",
      // Native N-API addons live under electron/native/. The CJS wrapper
      // and binding.gyp aren't part of the TypeScript build graph; they're
      // packaged build infrastructure (analogous to scripts/).
      "electron/native/**",
    ],
  }
);
