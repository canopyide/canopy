// Commands that trigger visual terminal clear (AI agents + standard shell)
export const CLEAR_COMMANDS = new Set(["/clear", "/new", "/reset", "clear", "cls"]);

/**
 * Tracks user input keystrokes to detect clear commands before Enter.
 * Handles multi-char chunks (paste), backspace, control characters, and escape sequences.
 */
export class InputTracker {
  private buffer = "";
  private inBracketedPaste = false;

  process(data: string): boolean {
    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      const code = char.charCodeAt(0);

      // Handle bracketed paste start: ESC[200~
      if (char === "\x1b" && data.substring(i, i + 6) === "\x1b[200~") {
        this.inBracketedPaste = true;
        i += 5;
        continue;
      }

      // Handle bracketed paste end: ESC[201~
      if (char === "\x1b" && data.substring(i, i + 6) === "\x1b[201~") {
        this.inBracketedPaste = false;
        i += 5;
        continue;
      }

      // Handle Enter (CR or LF) - check for clear command
      if (char === "\r" || char === "\n") {
        const cmd = this.buffer.trim();
        this.buffer = "";
        this.inBracketedPaste = false;
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

      // Handle escape sequences (arrows, home/end) -> Reset buffer
      if (char === "\x1b" && !this.inBracketedPaste) {
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
