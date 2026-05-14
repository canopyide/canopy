import { getGitRecoveryAction, getGitRecoveryHint } from "../../shared/utils/gitOperationErrors.js";
import type {
  ErrorRetryability,
  ErrorType,
  GitOperationReason,
  RecoveryAction,
} from "../../shared/types/ipc/errors.js";
import {
  ConfigError,
  FileSystemError,
  getRetryability,
  GitError,
  GitOperationError,
  ProcessError,
} from "./errorTypes.js";
import { ValidationError } from "../ipc/validationError.js";

/**
 * Intrinsic retryability buckets the classifier can derive from an error.
 * Excludes {@link ErrorRetryability}'s `"exhausted"` — that is a retry-loop
 * state set explicitly by the caller, not a property of the error itself.
 */
export type IntrinsicRetryability = Exclude<ErrorRetryability, "exhausted">;

export interface ErrorClassification {
  errorType: ErrorType;
  retryability: IntrinsicRetryability;
  recoveryHint?: string;
  gitReason?: GitOperationReason;
  recoveryAction?: RecoveryAction;
  isCritical: boolean;
}

const TLS_PROXY_CODES = new Set([
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "CERT_UNTRUSTED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

function isTlsProxyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && TLS_PROXY_CODES.has(code)) {
    return true;
  }
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (!message) return false;
  return (
    message.includes("unable to verify the first certificate") ||
    message.includes("self signed certificate") ||
    message.includes("self-signed certificate") ||
    message.includes("unable to get local issuer certificate")
  );
}

function isSpawnSyscall(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const syscall = (error as NodeJS.ErrnoException).syscall;
  if (typeof syscall === "string" && syscall.startsWith("spawn")) return true;
  if (error instanceof Error && error.message.includes("posix_spawnp")) return true;
  return false;
}

const NETWORK_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT"]);

interface ErrnoClass {
  recoveryHint: string;
  spawnRecoveryHint?: string;
}

const ERRNO_HINTS: Record<string, ErrnoClass> = {
  EACCES: {
    recoveryHint: "Check file permissions or run with elevated privileges.",
    spawnRecoveryHint: "The file exists but is not executable — check permissions.",
  },
  EPERM: {
    recoveryHint: "Check file permissions or run with elevated privileges.",
    spawnRecoveryHint: "The file exists but is not executable — check permissions.",
  },
  ENOENT: {
    recoveryHint: "Verify the file path is correct and the file exists.",
    spawnRecoveryHint: "Install the tool or add it to your PATH.",
  },
  ENOTFOUND: {
    recoveryHint: "Check your internet connection and DNS settings.",
  },
  ECONNREFUSED: {
    recoveryHint: "Ensure the target server or service is running.",
  },
  ETIMEDOUT: {
    recoveryHint: "Check your network connection and try again.",
  },
  ECONNRESET: {
    recoveryHint: "The connection was reset — try again in a moment.",
  },
  EMFILE: {
    recoveryHint: "Close some terminals to free up file descriptors and retry.",
  },
  ENOMEM: {
    recoveryHint: "Close other applications to free up memory and retry.",
  },
  ENXIO: {
    recoveryHint: "Close some terminals to free PTY resources and retry.",
  },
  EBUSY: {
    recoveryHint: "Close other applications using this file and retry.",
  },
  EAGAIN: {
    recoveryHint: "System is temporarily busy — wait a moment and retry.",
  },
};

function getErrnoCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Single-pass error classifier. Inspects the raw error once and returns all
 * computed fields — errorType, retryability, recoveryHint, gitReason,
 * recoveryAction, and isCritical — so downstream consumers never need to
 * re-inspect the raw value.
 */
export function classifyError(error: unknown): ErrorClassification {
  const code = getErrnoCode(error);
  const spawn = isSpawnSyscall(error);
  const tlsProxy = isTlsProxyError(error);

  // ── errorType ────────────────────────────────────────────────────────
  let errorType: ErrorType;
  if (error instanceof ValidationError) {
    errorType = "validation";
  } else if (error instanceof GitError) {
    errorType = "git";
  } else if (error instanceof ProcessError) {
    errorType = "process";
  } else if (error instanceof FileSystemError) {
    errorType = "filesystem";
  } else if (error instanceof ConfigError) {
    errorType = "config";
  } else if (code && NETWORK_CODES.has(code)) {
    errorType = "network";
  } else if (tlsProxy) {
    errorType = "network";
  } else {
    errorType = "unknown";
  }

  // ── retryability ─────────────────────────────────────────────────────
  // Delegates to getRetryability so git-reason classification (auth-failed →
  // user-gated, network-unavailable → auto, push-rejected-* → none) is honored
  // before falling through to the errno-based transient check. The classifier
  // never returns "exhausted" — that is loop state set by the caller.
  const retryability = getRetryability(error) as IntrinsicRetryability;

  // ── recoveryHint ─────────────────────────────────────────────────────
  let recoveryHint: string | undefined;
  if (error instanceof ProcessError) {
    recoveryHint = "The terminal process could not start.";
  } else if (error instanceof GitOperationError) {
    recoveryHint = getGitRecoveryHint(error.reason);
  } else if (error instanceof GitError) {
    const msg = error.message + (error.cause ? ` ${error.cause.message}` : "");
    if (msg.includes("not a git repository")) {
      recoveryHint = "Run 'git init' or open a folder containing a git repo.";
    } else if (msg.includes("Authentication failed") || msg.includes("authentication")) {
      recoveryHint = "Check your Git credentials or SSH key configuration.";
    }
  } else if (error instanceof ConfigError) {
    recoveryHint = "The configuration file may be corrupted — check the logs.";
  } else if (tlsProxy) {
    recoveryHint =
      "TLS inspection proxy detected. Set NODE_EXTRA_CA_CERTS=/path/to/corp-ca.pem (or NODE_USE_SYSTEM_CA=1 to use the OS keychain), then restart Daintree.";
  } else if (code) {
    const entry = ERRNO_HINTS[code];
    if (entry) {
      recoveryHint = spawn ? (entry.spawnRecoveryHint ?? entry.recoveryHint) : entry.recoveryHint;
    }
  } else if (spawn) {
    recoveryHint = "Install the tool or add it to your PATH.";
  }

  // ── gitReason / recoveryAction ────────────────────────────────────────
  const gitReason = error instanceof GitOperationError ? error.reason : undefined;
  const recoveryAction = gitReason ? getGitRecoveryAction(gitReason) : undefined;

  // ── isCritical ────────────────────────────────────────────────────────
  const isCritical = errorType === "config" || errorType === "filesystem";

  return { errorType, retryability, recoveryHint, gitReason, recoveryAction, isCritical };
}
