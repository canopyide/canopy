// TerminalWebGLManager loads `@xterm/addon-webgl` via dynamic import so the
// addon stays out of the renderer's eager critical path. Tests that mock the
// addon and then call `manager.ensureContext(...)` synchronously need the
// loader's class slot pre-seeded with the mocked constructor — otherwise the
// queued request only resolves a microtask later. Each terminal test file
// that mocks `@xterm/addon-webgl` should call this in its beforeEach.
export async function preloadMockWebglAddon(): Promise<void> {
  const webglMod = await import("@xterm/addon-webgl");
  const mgrMod = await import("../TerminalWebGLManager");
  mgrMod.__testing.setWebglAddonClass(
    webglMod.WebglAddon as unknown as new () => InstanceType<typeof webglMod.WebglAddon>
  );
}
