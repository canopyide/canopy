import { terminalPersistence } from "../../persistence/terminalPersistence";
import { useProjectStore } from "../../projectStore";
import type { TerminalInstance } from "./types";

export function flushTerminalPersistence(): void {
  terminalPersistence.flush();
}

export function saveTerminals(terminals: TerminalInstance[]): void {
  const projectId = useProjectStore.getState().currentProject?.id;
  terminalPersistence.save(terminals, projectId ?? undefined);
}
