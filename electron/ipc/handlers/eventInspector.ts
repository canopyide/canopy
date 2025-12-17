import { ipcMain } from "electron";
import { CHANNELS } from "../channels.js";
import type { HandlerDependencies } from "../types.js";
import type { FilterOptions as EventFilterOptions } from "../../services/EventBuffer.js";

export function registerEventInspectorHandlers(deps: HandlerDependencies): () => void {
  const { eventBuffer } = deps;
  const handlers: Array<() => void> = [];

  const handleEventInspectorGetEvents = async () => {
    if (!eventBuffer) {
      return [];
    }
    return eventBuffer.getAll();
  };
  ipcMain.handle(CHANNELS.EVENT_INSPECTOR_GET_EVENTS, handleEventInspectorGetEvents);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.EVENT_INSPECTOR_GET_EVENTS));

  const handleEventInspectorGetFiltered = async (
    _event: Electron.IpcMainInvokeEvent,
    filters: EventFilterOptions
  ) => {
    if (!eventBuffer) {
      return [];
    }
    return eventBuffer.getFiltered(filters);
  };
  ipcMain.handle(CHANNELS.EVENT_INSPECTOR_GET_FILTERED, handleEventInspectorGetFiltered);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.EVENT_INSPECTOR_GET_FILTERED));

  const handleEventInspectorClear = async () => {
    if (!eventBuffer) {
      return;
    }
    eventBuffer.clear();
  };
  ipcMain.handle(CHANNELS.EVENT_INSPECTOR_CLEAR, handleEventInspectorClear);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.EVENT_INSPECTOR_CLEAR));

  return () => handlers.forEach((cleanup) => cleanup());
}
