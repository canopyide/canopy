import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config.js";

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    exclude: ["node_modules", "dist", "dist-electron", "build", "release"],
  },
});
