import { describe, expect, it } from "vitest";
import { buttonVariants } from "../button";

describe("buttonVariants", () => {
  it("includes cursor-pointer in the base classes", () => {
    const classes = buttonVariants();
    expect(classes).toContain("cursor-pointer");
  });

  it("includes cursor-pointer across all variants", () => {
    const variants = [
      "default",
      "destructive",
      "outline",
      "secondary",
      "ghost",
      "link",
      "subtle",
      "pill",
      "ghost-danger",
      "ghost-success",
      "ghost-info",
      "info",
      "glow",
      "vibrant",
    ] as const;

    for (const variant of variants) {
      expect(buttonVariants({ variant })).toContain("cursor-pointer");
    }
  });
});
