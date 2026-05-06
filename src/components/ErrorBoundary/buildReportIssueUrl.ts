const REPO_ISSUE_URL = "https://github.com/daintreehq/daintree/issues/new";

// GitHub's Nginx fronts the issue form at an 8 KiB URL hard cap. Reserve
// ~1 KiB for base URL + title + percent-encoding fudge, leaving ~7 KB for
// the encoded body. Measured against `encodeURIComponent` because newlines
// and backticks inflate 1→3 bytes.
export const URL_BODY_BUDGET = 7000;

// When the stack must be middle-truncated we keep the top frames (where the
// throw originates) and the tail (where it bubbled up through React). 15+5
// fits a typical render-error stack while leaving the truncation visible.
export const STACK_HEAD_LINES = 15;
export const STACK_TAIL_LINES = 5;

const COMPONENT_STACK_PLACEHOLDER =
  "<!-- component stack omitted — exceeded URL budget; full report copied to clipboard -->";
const STACK_MIDDLE_PLACEHOLDER =
  "  ... [middle frames truncated — see clipboard for full stack] ...";

export interface ReportIssueInput {
  incidentId: string | null;
  componentName: string | undefined;
  message: string;
  stack: string;
  componentStack: string;
  context: Record<string, unknown> | undefined;
}

export interface ReportIssueResult {
  url: string;
  fullBody: string;
  usedClipboardFallback: boolean;
}

function formatBody(params: {
  componentName: string | undefined;
  incidentId: string | null;
  message: string;
  context: Record<string, unknown> | undefined;
  stack: string;
  componentStack: string;
}): string {
  const { componentName, incidentId, message, context, stack, componentStack } = params;
  return (
    `## Error Report\n\n` +
    `**Component:** ${componentName || "Unknown"}\n` +
    `**Incident ID:** ${incidentId ?? "unknown"}\n` +
    `**Message:** ${message || "Unknown error"}\n\n` +
    `**Context:**\n` +
    `${context ? JSON.stringify(context, null, 2) : "None"}\n\n` +
    `**Stack Trace:**\n\`\`\`\n${stack || "No stack trace"}\n\`\`\`\n\n` +
    `**Component Stack:**\n\`\`\`\n${componentStack || "No component stack"}\n\`\`\``
  );
}

function truncateStackMiddle(stack: string): string {
  const lines = stack.split("\n");
  if (lines.length <= STACK_HEAD_LINES + STACK_TAIL_LINES) return stack;
  const head = lines.slice(0, STACK_HEAD_LINES);
  const tail = lines.slice(-STACK_TAIL_LINES);
  return [...head, STACK_MIDDLE_PLACEHOLDER, ...tail].join("\n");
}

function buildStubBody(params: {
  componentName: string | undefined;
  incidentId: string | null;
  message: string;
}): string {
  const { componentName, incidentId, message } = params;
  return (
    `## Error Report\n\n` +
    `The full error details were copied to your clipboard — please paste them below.\n\n` +
    `**Component:** ${componentName || "Unknown"}\n` +
    `**Incident ID:** ${incidentId ?? "unknown"}\n` +
    `**Message:** ${message || "Unknown error"}\n`
  );
}

function makeUrl(title: string, body: string): string {
  return `${REPO_ISSUE_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

/**
 * Build the GitHub issue URL for a captured render error, applying a
 * staged truncation strategy so the encoded body always fits within the
 * URL budget. When even truncation isn't enough, the caller is told to
 * write `fullBody` to the clipboard and use the short stub URL.
 */
export function buildReportIssueUrl(input: ReportIssueInput): ReportIssueResult {
  const title = `Component Error: ${input.message || "Unknown"}`;
  const fullBody = formatBody({
    componentName: input.componentName,
    incidentId: input.incidentId,
    message: input.message,
    context: input.context,
    stack: input.stack,
    componentStack: input.componentStack,
  });

  if (encodeURIComponent(fullBody).length <= URL_BODY_BUDGET) {
    return { url: makeUrl(title, fullBody), fullBody, usedClipboardFallback: false };
  }

  const withoutComponentStack = formatBody({
    componentName: input.componentName,
    incidentId: input.incidentId,
    message: input.message,
    context: input.context,
    stack: input.stack,
    componentStack: COMPONENT_STACK_PLACEHOLDER,
  });

  if (encodeURIComponent(withoutComponentStack).length <= URL_BODY_BUDGET) {
    return {
      url: makeUrl(title, withoutComponentStack),
      fullBody,
      usedClipboardFallback: false,
    };
  }

  const truncatedStack = truncateStackMiddle(input.stack);
  const withTruncatedStack = formatBody({
    componentName: input.componentName,
    incidentId: input.incidentId,
    message: input.message,
    context: input.context,
    stack: truncatedStack,
    componentStack: COMPONENT_STACK_PLACEHOLDER,
  });

  if (encodeURIComponent(withTruncatedStack).length <= URL_BODY_BUDGET) {
    return {
      url: makeUrl(title, withTruncatedStack),
      fullBody,
      usedClipboardFallback: false,
    };
  }

  const stubBody = buildStubBody({
    componentName: input.componentName,
    incidentId: input.incidentId,
    message: input.message,
  });

  return { url: makeUrl(title, stubBody), fullBody, usedClipboardFallback: true };
}
