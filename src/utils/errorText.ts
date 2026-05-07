import { middleTruncate } from "./textParsing";

/* eslint-disable no-control-regex */
const OSC_7BIT = /\x1b\][\s\S]*?(?:\x07|\x1b\\)/g;
const OSC_8BIT = /\x9d[\s\S]*?(?:\x07|\x9c)/g;
const DCS_SOS_PM_APC_7BIT = /\x1b[PX^_][\s\S]*?\x1b\\/g;
const DCS_SOS_PM_APC_8BIT = /[\x90\x98\x9e\x9f][\s\S]*?\x9c/g;
const CSI = /\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g;
const FE_ESCAPE = /\x1b[\x20-\x2f]*[\x30-\x7e]/g;
const C0_AND_DEL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
const C1 = /[\x80-\x9f]/g;
/* eslint-enable no-control-regex */
// Bidi marks/embeddings/overrides/isolates: U+200E, U+200F, U+202A-U+202E,
// U+2066-U+2069. Line/paragraph separators: U+2028, U+2029. BOM: U+FEFF.
const BIDI_AND_SEPARATORS = new RegExp(
  "[" +
    "‎" + // LRM (Left-to-Right Mark)
    "‏" + // RLM (Right-to-Left Mark)
    "‪‫‬‭‮" + // LRE, RLE, PDF, LRO, RLO
    "  " + // Line/Paragraph separators
    "⁦⁧⁨⁩" + // LRI, RLI, FSI, PDI
    "﻿" + // BOM
    "]",
  "g"
);

/**
 * Strips terminal escape sequences and dangerous control/Unicode characters
 * from untrusted error text before rendering. Preserves printable text plus
 * HT (0x09), LF (0x0A), CR (0x0D).
 */
export function sanitizeErrorText(text: string): string {
  if (!text) return "";
  return text
    .replace(OSC_7BIT, "")
    .replace(OSC_8BIT, "")
    .replace(DCS_SOS_PM_APC_7BIT, "")
    .replace(DCS_SOS_PM_APC_8BIT, "")
    .replace(CSI, "")
    .replace(FE_ESCAPE, "")
    .replace(C0_AND_DEL, "")
    .replace(C1, "")
    .replace(BIDI_AND_SEPARATORS, "");
}

/**
 * Sanitizes then length-bounds an error string. Strip-then-truncate order
 * matters — escape sequences inflate raw character counts and truncating
 * first can leave dangling partial sequences.
 */
export function boundedErrorText(text: string, limit: number = 200): string {
  return middleTruncate(sanitizeErrorText(text), limit);
}
