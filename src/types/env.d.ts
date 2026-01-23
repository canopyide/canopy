export {};

declare global {
  var process:
    | {
        env?: {
          CANOPY_VERBOSE?: string;
        };
      }
    | undefined;
}
