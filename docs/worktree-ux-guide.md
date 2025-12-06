# Canopy WorktreeCard UX/UI Guide: High-Density Progressive Disclosure

## 1. Core Philosophy
**"Headline vs. Story"**
The user manages 10-20 parallel worktrees. The default view must be scan-friendly (the Headline). The focused view must be context-rich (the Story). 
**Rule:** Never show the same information twice in the same visual stack. Information "teleports" from the header to the details pane upon expansion.

## 2. The Logic Tree (Clean vs. Dirty)

The component renders based on two primary states:

### A. Dirty State (Active Work)
*   *Definition:* Uncommitted changes exist.
*   *UX Goal:* Focus on *current* modifications.
*   **Contracted (Headline):**
    *   **Activity:** File Change List (Compact, ~3 items).
    *   **Hidden:** Last Commit Message (it's history, not "now").
*   **Expanded (Story):**
    *   **Context:** Last Commit Message (Top of details, full text).
    *   **Activity:** Full File Change List (limit ~20).
    *   **Stats:** Full +/- diff stats.

### B. Clean State (Stable)
*   *Definition:* No uncommitted changes.
*   *UX Goal:* Context on "where we left off".
*   **Contracted (Headline):**
    *   **Activity:** Last Commit Message (Truncated to 1 line).
*   **Expanded (Story):**
    *   **Activity:** Last Commit Message (Teleports to details, full text).
    *   **Hidden:** Header Commit Message (to avoid duplication).

## 3. Visual Grid System (The Gutter)

A strict grid aligns content across all cards to prevent visual chaos.

*   **Column 1: The Gutter (Fixed `w-5` / 20px)**
    *   **Row 1:** Activity Dot (Status Color).
    *   **Row 2:** Chevron (Expand/Collapse).
    *   *Purpose:* Visual anchor for the eye.
*   **Column 2: Content Stream (Offset `ml-[1.625rem]`)**
    *   All text content (Badges, Branch Name, Commit Msg, File Lists) starts at this exact indentation.
    *   *Formula:* `w-5` (20px) + `gap-1.5` (6px) = 26px.

## 4. Row Hierarchy

1.  **Row 1 (Meta):** 
    *   *Left:* Activity Dot (Gutter)
    *   *Right:* Agent Status + Badges + **Action Buttons** (Always visible here).
2.  **Row 2 (Identity):**
    *   *Left:* Chevron (Gutter)
    *   *Right:* **Branch Name** (Primary Scan Anchor).
3.  **Row 3 (Activity Body):**
    *   *Left:* Indented Content.
    *   *Content:* Variable based on Clean/Dirty state (Commit or File List).
4.  **Row 4 (Details):**
    *   *Left:* Indented Content.
    *   *Content:* Full context, "Teleported" commit message, deep stats.

## 5. Implementation Checklist

- [x] **Strict Mutually Exclusive Rendering:** Body switches entirely based on `hasChanges`.
- [x] **Teleporting Commit:** 
    - Clean + Contracted: Show `firstLineLastCommitMessage` in Header.
    - Clean + Expanded: Hide Header, Show `rawLastCommitMessage` in Details.
    - Dirty: Hide Header, Show `rawLastCommitMessage` in Details.
- [x] **Gutter Alignment:** `ActivityLight` and `Chevron` share a `w-5` container.
- [x] **Content Indentation:** Body and Details use `ml-[1.625rem]`.
- [x] **Action Buttons:** Moved to Row 1 to prevent overlap with long branch names.
- [x] **Typography:** `whitespace-pre-wrap` for full commit messages in details.
