// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FuseResultMatch } from "@/hooks/useSearchablePalette";

import { HighlightedText, findMatchIndices } from "../HighlightedText";

describe("HighlightedText", () => {
  it("renders plain text when indices are missing", () => {
    const { container } = render(<HighlightedText text="New Terminal" indices={undefined} />);
    expect(container.textContent).toBe("New Terminal");
    expect(container.querySelector(".text-search-highlight-text")).toBeNull();
  });

  it("renders plain text when indices are empty", () => {
    const { container } = render(<HighlightedText text="New Terminal" indices={[]} />);
    expect(container.textContent).toBe("New Terminal");
    expect(container.querySelector(".text-search-highlight-text")).toBeNull();
  });

  it("highlights the matched range and preserves full text content", () => {
    const { container } = render(<HighlightedText text="New Terminal" indices={[[4, 11]]} />);
    expect(container.textContent).toBe("New Terminal");
    const marks = container.querySelectorAll(".text-search-highlight-text");
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe("Terminal");
    // Color alone differentiates — bold weight caused character-width jitter
    // as the user typed, so the highlight span must not change the weight.
    expect(marks[0]?.classList.contains("font-semibold")).toBe(false);
  });

  it("highlights a single character", () => {
    const { container } = render(<HighlightedText text="abc" indices={[[1, 1]]} />);
    expect(container.textContent).toBe("abc");
    const marks = container.querySelectorAll(".text-search-highlight-text");
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe("b");
  });

  it("renders multiple disjoint matches in order", () => {
    const { container } = render(
      <HighlightedText
        text="font font"
        indices={[
          [5, 8],
          [0, 3],
        ]}
      />
    );
    expect(container.textContent).toBe("font font");
    const marks = container.querySelectorAll(".text-search-highlight-text");
    expect(marks).toHaveLength(2);
    expect(marks[0]?.textContent).toBe("font");
    expect(marks[1]?.textContent).toBe("font");
  });

  it("merges overlapping indices into a single span without duplicating text", () => {
    // Fuse.js can emit overlapping/unsorted ranges when patterns split across
    // BitapSearch chunks. Merging into one span avoids both duplicate characters
    // and sub-pixel rendering gaps between adjacent spans.
    const { container } = render(
      <HighlightedText
        text="abcdefghij"
        indices={[
          [0, 4],
          [2, 6],
        ]}
      />
    );
    expect(container.textContent).toBe("abcdefghij");
    const marks = container.querySelectorAll(".text-search-highlight-text");
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe("abcdefg");
  });

  it("merges adjacent (touching) indices into a single span", () => {
    // Two ranges that touch (end+1 === nextStart) should render as one span
    // to avoid sub-pixel gaps between visually contiguous highlights.
    const { container } = render(
      <HighlightedText
        text="abcdefghi"
        indices={[
          [0, 2],
          [3, 5],
        ]}
      />
    );
    expect(container.textContent).toBe("abcdefghi");
    const marks = container.querySelectorAll(".text-search-highlight-text");
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe("abcdef");
  });
});

describe("findMatchIndices", () => {
  const matches: FuseResultMatch[] = [
    { key: "name", value: "Terminal", indices: [[0, 7]] },
    { key: "description", value: "A shell window", indices: [[2, 6]] },
  ];

  it("returns indices for a matching key", () => {
    expect(findMatchIndices(matches, "name")).toEqual([[0, 7]]);
    expect(findMatchIndices(matches, "description")).toEqual([[2, 6]]);
  });

  it("returns undefined for a missing key", () => {
    expect(findMatchIndices(matches, "nonexistent")).toBeUndefined();
  });

  it("returns undefined when matches is undefined", () => {
    expect(findMatchIndices(undefined, "name")).toBeUndefined();
  });
});
