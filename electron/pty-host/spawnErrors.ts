import type { SpawnError, SpawnErrorCode } from "../../shared/types/pty-host.js";

export function parseSpawnError(error: unknown): SpawnError {
  if (error instanceof Error) {
    const nodeErr = error as NodeJS.ErrnoException;

    let code: SpawnErrorCode = "UNKNOWN";
    if (nodeErr.code === "ENOENT") {
      code = "ENOENT";
    } else if (nodeErr.code === "EACCES") {
      code = "EACCES";
    } else if (nodeErr.code === "ENOTDIR") {
      code = "ENOTDIR";
    } else if (nodeErr.code === "EIO") {
      code = "EIO";
    } else if (nodeErr.code === "EMFILE") {
      code = "EMFILE";
    } else if (nodeErr.code === "EAGAIN") {
      code = "EAGAIN";
    } else if (nodeErr.code === "ENOMEM") {
      code = "ENOMEM";
    } else if (nodeErr.code === "ENXIO") {
      code = "ENXIO";
    } else if (nodeErr.code === "EBUSY") {
      code = "EBUSY";
    }

    return {
      code,
      message: nodeErr.message,
      errno: nodeErr.errno,
      syscall: nodeErr.syscall,
      path: nodeErr.path,
    };
  }

  return {
    code: "UNKNOWN",
    message: String(error),
  };
}
