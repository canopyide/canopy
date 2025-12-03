import type { Migration } from "../StoreMigrations.js";
import { migration001 } from "./001-initial-schema.js";
import { migration002 } from "./002-add-terminal-location.js";

export const migrations: Migration[] = [migration001, migration002];

export const CURRENT_SCHEMA_VERSION = 2;
