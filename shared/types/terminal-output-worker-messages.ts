export type TerminalOutputWorkerInboundMessage =
  | {
      type: "INIT_BUFFER";
      buffers: SharedArrayBuffer[];
      signalBuffer: SharedArrayBuffer;
    }
  | { type: "FLUSH_TERMINAL"; id: string }
  | { type: "RESET_TERMINAL"; id: string }
  | { type: "STOP" };

export type TerminalOutputWorkerOutboundMessage = {
  type: "OUTPUT_BATCH";
  batches: Array<{ id: string; data: string | Uint8Array }>;
};
