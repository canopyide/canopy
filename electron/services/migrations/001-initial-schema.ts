import type { Migration } from "../StoreMigrations.js";

export const migration001: Migration = {
  version: 1,
  description: "Baseline schema - captures initial structure",
  up: () => {
    // Baseline migration: no data transformation needed
    // Existing stores without _schemaVersion will be set to version 1
  },
};
