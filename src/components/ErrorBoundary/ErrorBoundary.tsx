import React, { Component, type ReactNode } from "react";
import { ErrorFallback, type ErrorFallbackProps } from "./ErrorFallback";
import { useErrorStore } from "@/store/errorStore";
import { actionService } from "@/services/ActionService";
import { logError } from "@/utils/logger";
import { captureRendererException } from "@/utils/rendererSentry";
import { buildReportIssueUrl } from "./buildReportIssueUrl";
import { notify } from "@/lib/notify";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: React.ComponentType<ErrorFallbackProps>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  onReset?: () => void;
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
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      incidentId: null,
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

    this.setState({
      errorInfo,
    });

    const correlationId = crypto.randomUUID();

    const sentryEventId = captureRendererException(error, {
      tags: {
        source: "react-error-boundary",
        component: componentName ?? "ErrorBoundary",
      },
      contexts: { react: { componentStack } },
      extra: { correlationId, ...(context ?? {}) },
    });

    let storeIncidentId: string | null = null;
    try {
      storeIncidentId = useErrorStore.getState().addError({
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

    // Prefer the Sentry event ID for the user-visible "Error ID" — engineers
    // can search Sentry by it directly. Fall back to the error-store ID when
    // Sentry isn't initialized so users always have *something* to quote.
    const incidentId = sentryEventId ?? storeIncidentId;

    this.setState({
      errorInfo,
      incidentId,
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
    const { onReset } = this.props;

    if (onReset) {
      try {
        onReset();
      } catch (error) {
        logError("Error in onReset handler", error);
      }
    }

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      incidentId: null,
    });
  };

  handleReport = async (): Promise<void> => {
    const { error, errorInfo, incidentId } = this.state;
    const { componentName, context } = this.props;

    if (!error) return;

    const { url, fullBody, usedClipboardFallback } = buildReportIssueUrl({
      incidentId,
      componentName,
      message: error.message,
      stack: error.stack ?? "",
      componentStack: errorInfo?.componentStack ?? "",
      context,
    });

    if (usedClipboardFallback) {
      let clipboardOk = false;
      try {
        await window.electron?.clipboard?.writeText?.(fullBody);
        clipboardOk = true;
      } catch (clipboardError) {
        logError("Failed to copy crash report to clipboard", clipboardError);
      }
      notify({
        type: "info",
        title: clipboardOk ? "Error details copied" : "Error details too long",
        message: clipboardOk
          ? "The full crash report was copied to your clipboard — paste it into the issue body."
          : "Couldn't copy the full report. Paste what you can; we'll match it to the incident ID.",
        inboxMessage: clipboardOk
          ? "Crash report copied to clipboard for the issue body."
          : "Couldn't copy crash report to clipboard.",
      });
    }

    if (!window.electron?.system?.openExternal) return;

    try {
      const result = await actionService.dispatch(
        "system.openExternal",
        { url },
        { source: "user" }
      );
      if (!result.ok) {
        window.electron.system.openExternal(url);
      }
    } catch {
      window.electron.system.openExternal(url);
    }
  };

  render(): ReactNode {
    const { hasError, error, errorInfo, incidentId } = this.state;
    const { children, fallback: FallbackComponent, variant, componentName } = this.props;

    if (hasError && error) {
      const Fallback = FallbackComponent || ErrorFallback;

      return (
        <Fallback
          error={error}
          errorInfo={errorInfo || undefined}
          resetError={this.resetError}
          variant={variant}
          componentName={componentName}
          incidentId={incidentId}
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
  onReset?: () => void;
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
      onReset={options.onReset}
      resetKeys={options.resetKeys}
    >
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name || "Component"})`;

  return WrappedComponent;
}
