// Mutable WebGL pool size, isolated from xterm imports so the eager renderer
// chunk can update it (via useResourceProfile) without pulling @xterm/addon-webgl.
let maxContexts = 12;

export function getMaxContexts(): number {
  return maxContexts;
}

export function setMaxContexts(n: number): void {
  maxContexts = Math.max(1, n);
}
