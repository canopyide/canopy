import type { ActionCallbacks, ActionRegistry } from "../actionTypes";
import { registerWorkflowCreationActions } from "./workflowCreationActions";
import { registerWorkflowUtilityActions } from "./workflowUtilityActions";

export function registerWorkflowActions(
  actions: ActionRegistry,
  callbacks: Pick<ActionCallbacks, "onLaunchAgent">
): void {
  registerWorkflowCreationActions(actions, callbacks);
  registerWorkflowUtilityActions(actions);
}
