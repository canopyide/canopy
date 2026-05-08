// @vitest-environment jsdom
import { render, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils", () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(" ") }));

import { HelpIntroBanner } from "../HelpIntroBanner";

describe("HelpIntroBanner", () => {
  it("renders the link copy and a Dismiss button", () => {
    const { getByText, getByLabelText } = render(
      <HelpIntroBanner onDismiss={vi.fn()} onLinkClick={vi.fn()} />
    );

    expect(getByText("See what the Daintree Assistant can do")).toBeTruthy();
    expect(getByLabelText("Dismiss")).toBeTruthy();
  });

  it("calls onLinkClick when the link is clicked", () => {
    const onLinkClick = vi.fn();
    const { getByText } = render(<HelpIntroBanner onDismiss={vi.fn()} onLinkClick={onLinkClick} />);

    fireEvent.click(getByText("See what the Daintree Assistant can do"));
    expect(onLinkClick).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss when the X button is clicked", () => {
    const onDismiss = vi.fn();
    const { getByLabelText } = render(
      <HelpIntroBanner onDismiss={onDismiss} onLinkClick={vi.fn()} />
    );

    fireEvent.click(getByLabelText("Dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("Escape bubbles to outer handler and does not dismiss", () => {
    const onDismiss = vi.fn();
    const outerKeyDown = vi.fn();
    const { getByLabelText } = render(
      <div onKeyDown={outerKeyDown}>
        <HelpIntroBanner onDismiss={onDismiss} onLinkClick={vi.fn()} />
      </div>
    );

    fireEvent.keyDown(getByLabelText("Dismiss"), { key: "Escape" });

    expect(onDismiss).not.toHaveBeenCalled();
    expect(outerKeyDown).toHaveBeenCalledTimes(1);
  });

  it("Escape on the link button bubbles and does not dismiss", () => {
    const onDismiss = vi.fn();
    const outerKeyDown = vi.fn();
    const { getByText } = render(
      <div onKeyDown={outerKeyDown}>
        <HelpIntroBanner onDismiss={onDismiss} onLinkClick={vi.fn()} />
      </div>
    );

    fireEvent.keyDown(getByText("See what the Daintree Assistant can do"), { key: "Escape" });

    expect(onDismiss).not.toHaveBeenCalled();
    expect(outerKeyDown).toHaveBeenCalledTimes(1);
  });

  it("does not call onDismiss for non-Escape keys", () => {
    const onDismiss = vi.fn();
    const { getByLabelText } = render(
      <HelpIntroBanner onDismiss={onDismiss} onLinkClick={vi.fn()} />
    );

    fireEvent.keyDown(getByLabelText("Dismiss"), { key: "Enter" });
    fireEvent.keyDown(getByLabelText("Dismiss"), { key: "Tab" });

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
