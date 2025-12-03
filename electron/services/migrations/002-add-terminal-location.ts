import type { Migration } from "../StoreMigrations.js";

export const migration002: Migration = {
  version: 2,
  description: "Add location field to terminals (grid/dock)",
  up: (store) => {
    const appState = store.get("appState");
    if (appState?.terminals && Array.isArray(appState.terminals)) {
      appState.terminals = appState.terminals.map((term) => ({
        ...term,
        location: term.location || "grid",
      }));
      store.set("appState", appState);
    }
  },
};
