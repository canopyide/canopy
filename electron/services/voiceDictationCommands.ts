/**
 * Dictation-command post-processor for the OpenAI realtime transcription path.
 *
 * The legacy Deepgram Dictation mode intercepted spoken commands ("new paragraph"
 * → \n\n, "period" → ".", etc.) at the transcription layer. OpenAI Realtime has
 * no equivalent — those phrases arrive as literal text. This module reproduces
 * the behavior in post-processing so users get the same UX.
 *
 * Safety: commands only fire when they form a trailing chain at the end of the
 * utterance. Mid-sentence uses like "I'll add a new paragraph here" stay literal.
 */

type CommandPhrase = string;
type CommandReplacement = string;

// Multi-word commands precede single-word commands so the regex alternation
// prefers the longer phrase ("exclamation point" before any hypothetical "point",
// "new paragraph" before any hypothetical "new").
const COMMAND_MAP: ReadonlyArray<readonly [CommandPhrase, CommandReplacement]> = [
  ["new paragraph", "\n\n"],
  ["new line", "\n"],
  ["exclamation point", "!"],
  ["exclamation mark", "!"],
  ["question mark", "?"],
  ["full stop", "."],
  ["period", "."],
  ["comma", ","],
];

const COMMAND_REPLACEMENTS = new Map<string, string>(
  COMMAND_MAP.map(([phrase, replacement]) => [phrase, replacement])
);

const COMMAND_ALTERNATION = COMMAND_MAP.map(([phrase]) => phrase.replace(/\s+/g, "\\s+")).join("|");

// Matches a trailing chain of one or more commands separated by whitespace.
// \b anchors at a word boundary so "period" doesn't match inside "periodic".
// $ anchors at end of string so commands embedded mid-sentence stay literal.
// Group 1 captures the chain (commands + their separating whitespace).
const TRAILING_CHAIN_RE = new RegExp(
  `\\s*\\b((?:${COMMAND_ALTERNATION})(?:\\s+(?:${COMMAND_ALTERNATION}))*)\\s*$`,
  "i"
);

// Used to tokenize a captured chain back into individual command phrases.
const SINGLE_COMMAND_RE = new RegExp(`(?:${COMMAND_ALTERNATION})`, "gi");

/**
 * Replace trailing spoken dictation commands with their text equivalents.
 *
 * Only the chain of commands at the END of the utterance is replaced — text
 * preceding the chain is preserved verbatim. A "chain" is one or more
 * recognized commands separated by whitespace.
 *
 * Examples:
 *   applyDictationCommands("hello period")              → "hello."
 *   applyDictationCommands("hello comma new paragraph") → "hello,\n\n"
 *   applyDictationCommands("new paragraph")             → "\n\n"
 *   applyDictationCommands("I'll add a new paragraph here") → unchanged
 *
 * Idempotent on text without trailing commands.
 */
export function applyDictationCommands(text: string): string {
  const match = TRAILING_CHAIN_RE.exec(text);
  if (!match) return text;

  const chain = match[1];
  const phrases = chain.match(SINGLE_COMMAND_RE);
  if (!phrases || phrases.length === 0) return text;

  const replaced = phrases
    .map((phrase) => {
      const key = phrase.replace(/\s+/g, " ").toLowerCase();
      return COMMAND_REPLACEMENTS.get(key) ?? phrase;
    })
    .join("");

  return text.slice(0, match.index) + replaced;
}
