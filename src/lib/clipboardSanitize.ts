// Paste-jacking defence: strip characters that can either auto-execute when
// pasted into a shell (LF/CR/ESC and other C0/C1 controls) or visually
// disguise the real payload (zero-width and Bidi format controls). Shell
// metacharacters (`|`, `;`, `&`, backtick) are intentionally preserved —
// `curl … | bash` pipes are legitimate command syntax we render verbatim.
//
// Ranges covered:
//   \x00-\x1f  C0 controls (NUL, LF, CR, ESC, TAB, …)
//   \x7f       DEL
//   \x80-\x9f  C1 controls
//   ​-‏  ZWSP, ZWNJ, ZWJ, LRM, RLM
//   ‪-‮  Bidi embedding/override (incl. RIGHT-TO-LEFT OVERRIDE)
//   ⁦-⁩  Bidi isolate marks
//   ﻿         BOM / zero-width no-break space
const PASTE_JACK_RE = /[\x00-\x1f\x7f-\x9f​-‏‪-‮⁦-⁩﻿]/g;

export function sanitizeForClipboard(text: string): string {
  return text.replace(PASTE_JACK_RE, "");
}
