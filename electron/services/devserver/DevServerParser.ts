const URL_PATTERNS = [
  new RegExp("Local:\\s+(https?://localhost:\\d+/?/?)", "i"),
  new RegExp("Ready on (https?://localhost:\\d+/?/?)", "i"),
  new RegExp("Listening on (https?://[\\w.-]+:\\d+/?/?)", "i"),
  new RegExp("Server (?:is )?(?:running|started) (?:on|at) (https?://[\\w.-]+:\\d+/?/?)", "i"),
  new RegExp("Local:\\s+(https?://localhost:\\d+/?/?)", "i"),
  new RegExp("Server is listening on (https?://[\\w.-]+:\\d+/?/?)", "i"),
  new RegExp("(?:Listening|Started) on (?:port )?(\\d+)", "i"),
  new RegExp("Project is running at (https?://[\\w.-]+:\\d+/?/?)", "i"),
  new RegExp("(https?://[\\w.-]+:\\d+/?/?)", "i"),
];

const PORT_PATTERNS = [/(?:Listening|Started) on (?:port )?(\d+)/i, /port[:\s]+(\d+)/i];

export interface DetectedServer {
  url?: string;
  port?: number;
}

/**
 * DevServerParser extracts URL and port information from dev server output.
 * Provides pure utility functions for parsing stdout/stderr streams.
 */
export class DevServerParser {
  /**
   * Detect URL and port from dev server output.
   * Tries URL patterns first, then port-only patterns.
   * Normalizes numeric strings to full URLs.
   *
   * @param output - Raw stdout or stderr output from dev server
   * @returns Detected URL/port or null if no match found
   */
  static detectUrl(output: string): DetectedServer | null {
    for (const pattern of URL_PATTERNS) {
      const match = output.match(pattern);
      if (match?.[1]) {
        let url = match[1];

        if (/^\d+$/.test(url)) {
          url = `http://localhost:${url}`;
        }

        const portMatch = url.match(/:(\d+)/);
        const port = portMatch ? parseInt(portMatch[1], 10) : undefined;

        return { url, port };
      }
    }

    for (const pattern of PORT_PATTERNS) {
      const match = output.match(pattern);
      if (match?.[1]) {
        const port = parseInt(match[1], 10);
        const url = `http://localhost:${port}`;
        return { url, port };
      }
    }

    return null;
  }

  /**
   * Extract just the port number from output.
   *
   * @param output - Raw stdout or stderr output
   * @returns Port number or null if not found
   */
  static detectPort(output: string): number | null {
    const detected = this.detectUrl(output);
    return detected?.port ?? null;
  }
}
