import type { Migration } from "../StoreMigrations.js";
import { migration002 } from "./002-add-terminal-location.js";
import { migration003 } from "./003-migrate-recipes-to-project.js";

export const migrations: Migration[] = [migration002, migration003];
