import { terminalPersistence } from "../../persistence/terminalPersistence";
import type { TerminalInstance } from "./types";
import type { TabGroup } from "@/types";

export function flushTerminalPersistence(): void {
  terminalPersistence.flush();
}

export function saveTerminals(terminals: TerminalInstance[]): void {
  terminalPersistence.save(terminals);
}

export function saveTabGroups(tabGroups: Map<string, TabGroup>): void {
  terminalPersistence.saveTabGroups(tabGroups);
}
