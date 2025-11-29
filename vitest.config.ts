import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["electron/**/*.{test,spec}.{js,ts}", "src/**/*.{test,spec}.{js,ts,jsx,tsx}"],
    exclude: ["node_modules", "dist", "dist-electron", "build", "release"],
  },
});
