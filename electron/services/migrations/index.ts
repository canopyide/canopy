import type { Migration } from "../StoreMigrations.js";
import { migration002 } from "./002-add-terminal-location.js";

export const migrations: Migration[] = [migration002];
