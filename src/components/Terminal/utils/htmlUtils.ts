import Anser from "anser";

/**
 * Escape HTML entities in a string.
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * URL regex pattern for detecting links in terminal output.
 * Matches http://, https://, and file:// URLs.
 */
const URL_REGEX = /\b(https?|file):\/\/[^\s<>"')\]},;]+/gi;

/**
 * Convert URLs in HTML to clickable anchor tags.
 * Handles URLs that may span across HTML tags from ANSI coloring.
 */
export function linkifyHtml(html: string): string {
  // Split by HTML tags to process text content separately
  const parts = html.split(/(<[^>]+>)/);

  return parts
    .map((part) => {
      // Skip HTML tags
      if (part.startsWith("<")) return part;

      // Replace URLs in text content
      return part.replace(URL_REGEX, (url) => {
        // Clean up any trailing punctuation that's likely not part of the URL
        let cleanUrl = url;
        const trailingPunct = /[.,;:!?)>\\\\]+$/;
        const match = cleanUrl.match(trailingPunct);
        let suffix = "";
        if (match) {
          suffix = match[0];
          cleanUrl = cleanUrl.slice(0, -suffix.length);
        }

        return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" style="color:#58a6ff;text-decoration:underline;text-underline-offset:2px">${cleanUrl}</a>${suffix}`;
      });
    })
    .join("");
}

/**
 * Convert ANSI lines to HTML using Anser library.
 * Maintains color state across lines for proper continuation.
 * Also converts URLs to clickable links.
 */
export function convertAnsiLinesToHtml(ansiLines: string[]): string[] {
  return ansiLines.map((line) => {
    if (!line) return " ";
    // Use Anser to convert ANSI to HTML with inline styles
    let html = Anser.ansiToHtml(line, { use_classes: false });
    // Convert URLs to clickable links
    html = linkifyHtml(html);
    return html || " ";
  });
}
