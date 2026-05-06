import React, { Component, type ReactNode } from "react";
import { ErrorFallback, type ErrorFallbackProps } from "./ErrorFallback";
import { useErrorStore } from "@/store/errorStore";
import { actionService } from "@/services/ActionService";
import { logError } from "@/utils/logger";
import { captureRendererException } from "@/utils/rendererSentry";
import { safeFireAndForget } from "@/utils/safeFireAndForget";
import { notify } from "@/lib/notify";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: React.ComponentType<ErrorFallbackProps>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  resetKeys?: Array<string | number>;
  variant?: "fullscreen" | "section" | "component";
  componentName?: string;
  context?: {
    worktreeId?: string;
    terminalId?: string;
  };
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  incidentId: string | null;
  sentryEventId: string | null;
}

// GitHub's Nginx layer rejects URLs over ~8 KB; budget the encoded URL string
// at 7 200 chars to leave headroom for browser/OS handling and percent-encoding
// quirks. Stack traces are dense with newlines (`%0A`) and spaces (`%20`),
// so the encoded length is typically 2–3× the raw byte count.
const ISSUE_URL_BUDGET = 7200;
const STACK_TOP_LINES = 15;
const STACK_BOTTOM_LINES = 5;
const TITLE_MESSAGE_CAP = 200;
const TRUNCATION_PLACEHOLDER = "\n… (middle truncated — full report copied to clipboard) …\n";

// `encodeURIComponent` throws `URIError: URI malformed` on lone (unpaired)
// surrogates, which can appear in errors originating from native modules,
// WASM, or mis-decoded byte streams. Replace any unpaired surrogate with the
// Unicode replacement char so encoding always succeeds inside an error path
// where throwing again would lose the report entirely.
function sanitizeForUriComponent(value: string): string {
  return value.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "�"
  );
}

function capMessage(message: string, cap = TITLE_MESSAGE_CAP): string {
  if (message.length <= cap) return message;
  return `${message.slice(0, cap)}…`;
}

interface CrashReportInput {
  componentName: string;
  sentryEventId: string | null;
  incidentId: string | null;
  message: string;
  contextJson: string;
  stack: string;
  componentStack: string;
}

function buildCrashReportBody(input: CrashReportInput): string {
  return (
    `## Error Report\n\n` +
    `**Component:** ${input.componentName}\n` +
    `**Sentry Event ID:** ${input.sentryEventId ?? "unavailable (telemetry off)"}\n` +
    `**Incident ID:** ${input.incidentId ?? "unknown"}\n` +
    `**Message:** ${input.message}\n\n` +
    `**Context:**\n${input.contextJson}\n\n` +
    `**Stack Trace:**\n\`\`\`\n${input.stack}\n\`\`\`\n\n` +
    `**Component Stack:**\n\`\`\`\n${input.componentStack}\n\`\`\``
  );
}

function truncateStackMiddle(
  stack: string,
  topLines = STACK_TOP_LINES,
  bottomLines = STACK_BOTTOM_LINES
): string {
  const lines = stack.split("\n");
  if (lines.length <= topLines + bottomLines) return stack;
  const head = lines.slice(0, topLines).join("\n");
  const tail = lines.slice(-bottomLines).join("\n");
  return `${head}${TRUNCATION_PLACEHOLDER}${tail}`;
}

function buildIssueUrl(title: string, body: string): string {
  return (
    `https://github.com/daintreehq/daintree/issues/new` +
    `?title=${encodeURIComponent(sanitizeForUriComponent(title))}` +
    `&body=${encodeURIComponent(sanitizeForUriComponent(body))}`
  );
}

function openIssueUrl(url: string): void {
  const directOpen = window.electron?.system?.openExternal;
  if (!directOpen) return;
  safeFireAndForget(
    (async (): Promise<void> => {
      try {
        const result = await actionService.dispatch(
          "system.openExternal",
          { url },
          { source: "user" }
        );
        if (!result.ok) await directOpen(url);
      } catch {
        await directOpen(url);
      }
    })(),
    { context: "ErrorBoundary.openIssueUrl" }
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      incidentId: null,
      sentryEventId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const { onError, context, componentName } = this.props;
    const componentStack = errorInfo.componentStack || "";

    const correlationId = crypto.randomUUID();

    const sentryEventId =
      captureRendererException(error, {
        tags: {
          source: "react-error-boundary",
          component: componentName ?? "ErrorBoundary",
        },
        contexts: { react: { componentStack } },
        extra: { correlationId, ...(context ?? {}) },
      }) ?? null;

    let incidentId: string | null = null;
    try {
      incidentId = useErrorStore.getState().addError({
        type: "unknown",
        message: error.message || "Component rendering error",
        details: `${error.stack || ""}\n\nComponent Stack:${componentStack}`,
        source: componentName || "ErrorBoundary",
        context,
        isTransient: false,
        correlationId,
      });
    } catch (storeError) {
      logError("Failed to add error to store", storeError);
    }

    this.setState({
      errorInfo,
      incidentId,
      sentryEventId,
    });

    if (onError) {
      try {
        onError(error, errorInfo);
      } catch (handlerError) {
        logError("Error in onError handler", handlerError);
      }
    }

    logError("React error boundary caught render error", error, {
      correlationId,
      componentName: componentName || "ErrorBoundary",
      context,
      componentStack,
      incidentId,
      sentryEventId,
    });

    logError("ErrorBoundary caught error", error, { errorInfo });
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    const { resetKeys } = this.props;
    const { hasError } = this.state;

    if (hasError && resetKeys) {
      const prevResetKeys = prevProps.resetKeys || [];
      const hasResetKeyChanged =
        resetKeys.length !== prevResetKeys.length ||
        resetKeys.some((key, index) => key !== prevResetKeys[index]);

      if (hasResetKeyChanged) {
        this.resetError();
      }
    }
  }

  resetError = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      incidentId: null,
      sentryEventId: null,
    });
  };

  handleReport = (): void => {
    try {
      const { error, errorInfo, incidentId, sentryEventId } = this.state;
      const { componentName, context } = this.props;

      const rawMessage = error?.message || "Unknown error";
      // The title is bounded — any single error.message embedded in the URL would
      // blow the budget on its own (see #6884: validation errors with embedded
      // JSON can be 4–10 KB). The full message still appears in the body.
      const cappedMessage = capMessage(rawMessage);
      const title = `Component Error: ${cappedMessage}`;
      const stack = error?.stack || "No stack trace";
      const componentStack = errorInfo?.componentStack || "No component stack";
      const contextJson = context ? JSON.stringify(context, null, 2) : "None";

      const fullBody = buildCrashReportBody({
        componentName: componentName || "Unknown",
        sentryEventId,
        incidentId,
        message: rawMessage,
        contextJson,
        stack,
        componentStack,
      });

      // Belt-and-suspenders: copy the full payload before opening any URL so
      // the user can paste it even if the deeplink opens with truncated
      // content. Wrap the IPC call in case the binding throws synchronously
      // (the Promise reject path is handled by safeFireAndForget).
      const writeText = window.electron?.clipboard?.writeText;
      let clipboardWritten = false;
      if (writeText) {
        try {
          safeFireAndForget(writeText(fullBody), {
            context: "ErrorBoundary.handleReport: clipboard.writeText",
          });
          clipboardWritten = true;
        } catch (clipboardError) {
          logError("ErrorBoundary clipboard write threw synchronously", clipboardError);
        }
      }

      const fullUrl = buildIssueUrl(title, fullBody);
      if (fullUrl.length <= ISSUE_URL_BUDGET) {
        openIssueUrl(fullUrl);
        return;
      }

      const truncatedBody = buildCrashReportBody({
        componentName: componentName || "Unknown",
        sentryEventId,
        incidentId,
        message: rawMessage,
        contextJson,
        stack: truncateStackMiddle(stack),
        componentStack: truncateStackMiddle(componentStack),
      });
      const truncatedUrl = buildIssueUrl(title, truncatedBody);
      if (truncatedUrl.length <= ISSUE_URL_BUDGET) {
        openIssueUrl(truncatedUrl);
        return;
      }

      const minimalBody =
        `## Error Report\n\n` +
        `**Component:** ${componentName || "Unknown"}\n` +
        `**Sentry Event ID:** ${sentryEventId ?? "unavailable (telemetry off)"}\n` +
        `**Incident ID:** ${incidentId ?? "unknown"}\n` +
        `**Message:** ${cappedMessage}\n\n` +
        `_The full error report (stack trace + component stack) was too large ` +
        `for a deeplink and has been copied to your clipboard. Please paste it below._`;
      const minimalUrl = buildIssueUrl(title, minimalBody);
      // Final guard: if even the minimal URL is over budget (extremely long
      // component name or context), open a bare issue page rather than a 414.
      const finalUrl =
        minimalUrl.length <= ISSUE_URL_BUDGET
          ? minimalUrl
          : "https://github.com/daintreehq/daintree/issues/new";
      openIssueUrl(finalUrl);

      if (clipboardWritten) {
        notify({
          type: "info",
          title: "Report copied to clipboard",
          message:
            "The full report was too large to include in the link. Paste it into the issue body.",
        });
      } else {
        notify({
          type: "warning",
          title: "Couldn't copy full report",
          message:
            "The clipboard isn't available, so only a summary was sent. Reproduce the error and copy logs manually if possible.",
        });
      }
    } catch (reportError) {
      // handleReport is the user's escape hatch from a crashed UI — do not
      // throw out of it. Log and try to open a bare issue page so the user
      // can still file something.
      logError("ErrorBoundary handleReport failed", reportError);
      openIssueUrl("https://github.com/daintreehq/daintree/issues/new");
    }
  };

  render(): ReactNode {
    const { hasError, error, errorInfo, incidentId, sentryEventId } = this.state;
    const { children, fallback: FallbackComponent, variant, componentName } = this.props;

    if (hasError && error) {
      const Fallback = FallbackComponent || ErrorFallback;
      const displayId = sentryEventId ?? incidentId;

      return (
        <Fallback
          error={error}
          errorInfo={errorInfo || undefined}
          resetError={this.resetError}
          variant={variant}
          componentName={componentName}
          incidentId={displayId}
          onReport={variant !== "component" ? this.handleReport : undefined}
        />
      );
    }

    return children;
  }
}

export interface WithErrorBoundaryOptions {
  variant?: "fullscreen" | "section" | "component";
  componentName?: string;
  context?: {
    worktreeId?: string;
    terminalId?: string;
  };
  resetKeys?: Array<string | number>;
}

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  options: WithErrorBoundaryOptions = {}
): React.ComponentType<P> {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary
      variant={options.variant || "component"}
      componentName={options.componentName || Component.displayName || Component.name}
      context={options.context}
      resetKeys={options.resetKeys}
    >
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name || "Component"})`;

  return WrappedComponent;
}
