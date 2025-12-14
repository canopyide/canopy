export interface DataEmitterLike {
  onData: (callback: (data: string) => void) => { dispose: () => void };
}

export function installHeadlessResponder(
  terminal: DataEmitterLike,
  writeToPty: (data: string) => void
): { dispose: () => void } {
  return terminal.onData((data) => {
    try {
      writeToPty(data);
    } catch {
      // Ignore write errors - PTY may already be dead
    }
  });
}
