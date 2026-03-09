// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsSubtabBar } from "../SettingsSubtabBar";

const SUBTABS = [
  { id: "claude", label: "Claude" },
  { id: "gemini", label: "Gemini" },
  { id: "codex", label: "Codex" },
];

describe("SettingsSubtabBar", () => {
  it("renders all subtab buttons", () => {
    const onChange = vi.fn();
    render(<SettingsSubtabBar subtabs={SUBTABS} activeId="claude" onChange={onChange} />);
    expect(screen.getByRole("tab", { name: "Claude" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Gemini" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Codex" })).toBeTruthy();
  });

  it("marks the active tab as selected", () => {
    render(<SettingsSubtabBar subtabs={SUBTABS} activeId="gemini" onChange={vi.fn()} />);
    const geminiBtn = screen.getByRole("tab", { name: "Gemini" });
    expect(geminiBtn.getAttribute("aria-selected")).toBe("true");
    const claudeBtn = screen.getByRole("tab", { name: "Claude" });
    expect(claudeBtn.getAttribute("aria-selected")).toBe("false");
  });

  it("calls onChange with the clicked subtab id", () => {
    const onChange = vi.fn();
    render(<SettingsSubtabBar subtabs={SUBTABS} activeId="claude" onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "Gemini" }));
    expect(onChange).toHaveBeenCalledWith("gemini");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("renders icons via renderIcon with isActive flag", () => {
    const renderIcon = vi.fn((isActive: boolean) => (
      <span data-testid={isActive ? "active-icon" : "inactive-icon"} />
    ));
    const subtabs = [
      { id: "a", label: "A", renderIcon },
      { id: "b", label: "B", renderIcon },
    ];
    render(<SettingsSubtabBar subtabs={subtabs} activeId="a" onChange={vi.fn()} />);
    expect(screen.getAllByTestId("active-icon")).toHaveLength(1);
    expect(screen.getAllByTestId("inactive-icon")).toHaveLength(1);
  });

  it("renders trailing content", () => {
    const subtabs = [
      {
        id: "a",
        label: "A",
        trailing: <span data-testid="trailing-dot" />,
      },
    ];
    render(<SettingsSubtabBar subtabs={subtabs} activeId="a" onChange={vi.fn()} />);
    expect(screen.getByTestId("trailing-dot")).toBeTruthy();
  });

  it("renders with tablist role", () => {
    render(<SettingsSubtabBar subtabs={SUBTABS} activeId="claude" onChange={vi.fn()} />);
    expect(screen.getByRole("tablist")).toBeTruthy();
  });
});
