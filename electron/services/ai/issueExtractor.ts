// Regex patterns to try (fast, no API cost)
const ISSUE_PATTERNS = [
  /issue-(\d+)/i,           // feature/issue-158-description
  /issues?\/(\d+)/i,        // fix/issues/42
  /#(\d+)/,                 // feature/#42-description
  /gh-(\d+)/i,              // fix/GH-42-login-bug or gh-123
  /jira-(\d+)/i,            // feature/jira-456-task
];

// In-memory cache: branch name -> issue number (or null if no issue found)
const issueCache = new Map<string, number | null>();

// Branches that should never have issue numbers
const SKIP_BRANCHES = ['main', 'master', 'develop', 'staging', 'production', 'release', 'hotfix'];

/**
 * Extract issue number synchronously using regex patterns only.
 * No AI fallback in Electron version yet.
 */
export function extractIssueNumberSync(branchName: string, folderName?: string): number | null {
  // Handle empty or invalid input
  if (!branchName || typeof branchName !== 'string') {
    return null;
  }

  const trimmedBranch = branchName.trim();
  if (!trimmedBranch) {
    return null;
  }

  // Cache key includes folder name if provided
  const cacheKey = folderName ? `${trimmedBranch}|${folderName}` : trimmedBranch;

  // Check cache first
  if (issueCache.has(cacheKey)) {
    return issueCache.get(cacheKey)!;
  }

  // Skip obvious non-issue branches
  const lowerBranch = trimmedBranch.toLowerCase();
  if (SKIP_BRANCHES.some(skip => lowerBranch === skip || lowerBranch.startsWith(`${skip}/`))) {
    issueCache.set(cacheKey, null);
    return null;
  }

  // Try regex patterns on branch name
  for (const pattern of ISSUE_PATTERNS) {
    const match = trimmedBranch.match(pattern);
    if (match?.[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > 0) {
        issueCache.set(cacheKey, num);
        return num;
      }
    }
  }

  // Try regex patterns on folder name if provided
  if (folderName) {
    const trimmedFolder = folderName.trim();
    for (const pattern of ISSUE_PATTERNS) {
      const match = trimmedFolder.match(pattern);
      if (match?.[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > 0) {
          issueCache.set(cacheKey, num);
          return num;
        }
      }
    }
  }

  // No match found
  issueCache.set(cacheKey, null);
  return null;
}

/**
 * Async version with AI fallback - currently just wraps sync version
 * TODO: Add AI fallback when implemented
 */
export async function extractIssueNumber(branchName: string, folderName?: string): Promise<number | null> {
  return extractIssueNumberSync(branchName, folderName);
}
