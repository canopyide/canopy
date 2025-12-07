// Commands that trigger visual terminal clear (AI agents + standard shell)
export const CLEAR_COMMANDS = new Set(["/clear", "/new", "/reset", "clear", "cls"]);

// VT100 escape sequences for terminal clearing (optimized order for compatibility)
export const VT100_CLEAR_SCROLLBACK = "\x1b[3J"; // Clear scrollback buffer first
export const VT100_CURSOR_HOME = "\x1b[H"; // Move cursor to (1,1)
export const VT100_CLEAR_SCREEN = "\x1b[2J"; // Clear entire screen
export const VT100_FULL_CLEAR = `${VT100_CLEAR_SCROLLBACK}${VT100_CURSOR_HOME}${VT100_CLEAR_SCREEN}`;

/**
 * Tracks user input keystrokes to detect clear commands before Enter.
 * Handles multi-char chunks (paste), backspace, control characters, and escape sequences.
 */
export class InputTracker {
  private buffer = "";

  process(data: string): boolean {
    // Process each character in the chunk (handles paste and multi-char input)
    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      const code = char.charCodeAt(0);

      // Handle Enter (CR or LF) - check for clear command
      if (char === "\r" || char === "\n") {
        const cmd = this.buffer.trim();
        this.buffer = "";
        if (CLEAR_COMMANDS.has(cmd)) {
          return true;
        }
        continue;
      }

      // Handle Backspace (DEL - 0x7f)
      if (char === "\x7f") {
        this.buffer = this.buffer.slice(0, -1);
        continue;
      }

      // Handle escape sequences (arrows, home/end, bracketed paste) -> Reset buffer
      // These start with ESC (0x1b) and should not be accumulated
      if (char === "\x1b") {
        this.buffer = "";
        continue;
      }

      // Handle other control characters (Ctrl+C, Ctrl+D, etc) -> Reset buffer
      if (code < 32) {
        this.buffer = "";
        continue;
      }

      // Accumulate printable characters
      this.buffer += char;
    }

    return false;
  }
}
