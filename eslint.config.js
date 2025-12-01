import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended rules
  ...tseslint.configs.recommended,

  // React configuration
  {
    files: ["**/*.{tsx,jsx,ts}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // React rules
      "react/react-in-jsx-scope": "off", // Not needed in React 17+
      "react/prop-types": "off", // Using TypeScript for prop validation
      "react/jsx-uses-react": "off",
      "react/jsx-uses-vars": "error",

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

  // Prettier must be last to override conflicting rules
  prettier,

  // Global ignores
  {
    ignores: [
      "dist/**",
      "dist-electron/**",
      "release/**",
      "node_modules/**",
      "*.config.js",
      "*.config.cjs",
      "scripts/**",
      "build/**",
    ],
  }
);
