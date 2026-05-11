// Fixture-only IpcInvokeMap that the fixture handlers register against.

export interface CommandPayload {
  commandId: string;
  args?: Record<string, unknown>;
}

export interface CommandResult {
  ok: boolean;
}

export interface IpcInvokeMap {
  "fixture:no-args": {
    args: [];
    result: number;
  };
  "fixture:string-arg": {
    args: [name: string];
    result: void;
  };
  "fixture:multi-arg": {
    args: [id: string, count: number];
    result: boolean;
  };
  "fixture:object-result": {
    args: [];
    result: { value: string; ok: true };
  };
  "fixture:validated": {
    args: [payload: CommandPayload];
    result: CommandResult;
  };
  "fixture:with-context": {
    args: [id: string];
    result: void;
  };
  "fixture:inside-fn": {
    args: [];
    result: string[];
  };
}
