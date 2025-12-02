import { describe, it, expect } from "vitest";
import { formatBytes } from "../formatBytes";

describe("formatBytes", () => {
  it("should format zero bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("should format bytes", () => {
    expect(formatBytes(1)).toBe("1 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("should format kilobytes", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(10240)).toBe("10 KB");
  });

  it("should format megabytes", () => {
    expect(formatBytes(1048576)).toBe("1 MB");
    expect(formatBytes(5242880)).toBe("5 MB");
    expect(formatBytes(1572864)).toBe("1.5 MB");
  });

  it("should format gigabytes", () => {
    expect(formatBytes(1073741824)).toBe("1 GB");
    expect(formatBytes(5368709120)).toBe("5 GB");
    expect(formatBytes(1610612736)).toBe("1.5 GB");
  });

  it("should format terabytes", () => {
    expect(formatBytes(1099511627776)).toBe("1 TB");
    expect(formatBytes(5497558138880)).toBe("5 TB");
  });

  it("should round to 1 decimal place", () => {
    expect(formatBytes(1234)).toBe("1.2 KB");
    expect(formatBytes(1567)).toBe("1.5 KB");
    expect(formatBytes(1890)).toBe("1.8 KB");
  });

  it("should handle boundary values correctly", () => {
    // Just below 1 KB (should stay in bytes)
    expect(formatBytes(1023)).toBe("1023 B");

    // Just below 1 MB (should stay in KB, not round up to 1024 KB)
    expect(formatBytes(1048575)).toBe("1 MB"); // 1024^2 - 1 rounds to 1 MB

    // Just below 1 GB
    expect(formatBytes(1073741823)).toBe("1 GB"); // 1024^3 - 1 rounds to 1 GB
  });

  it("should handle negative and sub-byte values", () => {
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(-1000)).toBe("0 B");
    expect(formatBytes(0.5)).toBe("0.5 B"); // Fractional bytes are shown as-is
  });

  it("should handle very large values (petabytes and above)", () => {
    // 1 PB (beyond TB range) - should clamp to TB
    expect(formatBytes(1125899906842624)).toBe("1024 TB");

    // 10 PB
    expect(formatBytes(11258999068426240)).toBe("10240 TB");
  });
});
