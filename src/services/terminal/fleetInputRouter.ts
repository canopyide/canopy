import { terminalClient } from "@/clients";
import { useFleetArmingStore } from "@/store/fleetArmingStore";

export type FleetInputBroadcastHandler = (originId: string, data: string) => boolean;

let fleetInputBroadcastHandler: FleetInputBroadcastHandler | null = null;

export function registerFleetInputBroadcastHandler(
  handler: FleetInputBroadcastHandler
): () => void {
  fleetInputBroadcastHandler = handler;
  return () => {
    if (fleetInputBroadcastHandler === handler) {
      fleetInputBroadcastHandler = null;
    }
  };
}

export function resetFleetInputBroadcastHandlerForTests(): void {
  fleetInputBroadcastHandler = null;
}

export function writeTerminalInputOrFleet(originId: string, data: string): void {
  if (data.length === 0) return;

  if (fleetInputBroadcastHandler?.(originId, data)) {
    // Fleet path engaged — bump the broadcast signal so the ribbon can fire
    // a one-shot commit flash. Counter increments only; subscribers diff
    // against their last observed value to detect a new commit.
    useFleetArmingStore.getState().noteBroadcastCommit();
    return;
  }

  terminalClient.write(originId, data);
}
