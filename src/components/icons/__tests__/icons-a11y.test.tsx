// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DaintreeIcon } from "../DaintreeIcon";
import { SpinnerCircle } from "../AgentStateCircles";
import { ClaudeIcon } from "../brands/ClaudeIcon";
import { NpmIcon } from "../brands/NpmIcon";

describe("DaintreeIcon a11y", () => {
  it("is decorative and exposes no aria-label", () => {
    const { container } = render(<DaintreeIcon />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.hasAttribute("aria-label")).toBe(false);
  });
});

describe("AgentStateCircles a11y", () => {
  it("defaults to aria-hidden='true'", () => {
    const { container } = render(<SpinnerCircle />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("allows callers to override aria-hidden and supply a label", () => {
    const { container } = render(
      <SpinnerCircle aria-hidden={undefined} role="img" aria-label="Working" />
    );
    const svg = container.querySelector("svg");
    expect(svg?.hasAttribute("aria-hidden")).toBe(false);
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toBe("Working");
  });
});

describe("Brand icon a11y", () => {
  it("ClaudeIcon defaults to aria-hidden and forwards arbitrary SVG props", () => {
    const { container } = render(
      <ClaudeIcon className="text-state-working" data-testid="claude" />
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("class")).toContain("text-state-working");
    expect(svg?.getAttribute("data-testid")).toBe("claude");
  });

  it("ClaudeIcon allows overriding aria-hidden when used as the sole label", () => {
    const { container } = render(
      <ClaudeIcon aria-hidden={undefined} role="img" aria-label="Claude agent" />
    );
    const svg = container.querySelector("svg");
    expect(svg?.hasAttribute("aria-hidden")).toBe(false);
    expect(svg?.getAttribute("aria-label")).toBe("Claude agent");
  });

  it("NpmIcon (no brandColor variant) defaults to aria-hidden and forwards props", () => {
    const { container } = render(<NpmIcon className="size-4" data-testid="npm" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("class")).toContain("size-4");
    expect(svg?.getAttribute("data-testid")).toBe("npm");
  });
});
