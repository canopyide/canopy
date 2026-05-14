import { describe, it, expect } from "vitest";
import { isAbsolute, normalize, basename, dirname, resolve, join } from "../path.js";

describe("isAbsolute", () => {
  it("recognizes POSIX absolute paths", () => {
    expect(isAbsolute("/foo/bar")).toBe(true);
    expect(isAbsolute("/")).toBe(true);
  });

  it("recognizes Windows drive-letter paths", () => {
    expect(isAbsolute("C:/foo")).toBe(true);
    expect(isAbsolute("C:\\foo")).toBe(true);
    expect(isAbsolute("d:/x")).toBe(true);
  });

  it("recognizes UNC paths", () => {
    expect(isAbsolute("\\\\server\\share")).toBe(true);
    expect(isAbsolute("//server/share")).toBe(true);
  });

  it("rejects relative paths", () => {
    expect(isAbsolute("foo/bar")).toBe(false);
    expect(isAbsolute("./foo")).toBe(false);
    expect(isAbsolute("../foo")).toBe(false);
    expect(isAbsolute("")).toBe(false);
  });
});

describe("normalize", () => {
  it("returns '.' for empty input", () => {
    expect(normalize("")).toBe(".");
  });

  it("collapses redundant separators", () => {
    expect(normalize("/foo//bar")).toBe("/foo/bar");
    expect(normalize("foo///bar")).toBe("foo/bar");
  });

  it("converts backslashes to forward slashes", () => {
    expect(normalize("foo\\bar\\baz")).toBe("foo/bar/baz");
    expect(normalize("C:\\foo\\bar")).toBe("C:/foo/bar");
  });

  it("strips trailing slashes", () => {
    expect(normalize("/foo/bar/")).toBe("/foo/bar");
    expect(normalize("foo/")).toBe("foo");
  });

  it("resolves '.' segments", () => {
    expect(normalize("/foo/./bar")).toBe("/foo/bar");
    expect(normalize("./foo")).toBe("foo");
  });

  it("resolves '..' segments", () => {
    expect(normalize("/foo/bar/../baz")).toBe("/foo/baz");
    expect(normalize("foo/../bar")).toBe("bar");
  });

  it("preserves leading '..' for relative paths", () => {
    expect(normalize("../foo")).toBe("../foo");
    expect(normalize("../../foo")).toBe("../../foo");
  });

  it("does not escape above the root for absolute paths", () => {
    expect(normalize("/../foo")).toBe("/foo");
    expect(normalize("/foo/../..")).toBe("/");
  });

  it("preserves Windows drive prefix", () => {
    expect(normalize("C:/foo/bar")).toBe("C:/foo/bar");
    expect(normalize("C:/foo/../bar")).toBe("C:/bar");
  });

  it("preserves UNC prefix without collapsing the double slash", () => {
    expect(normalize("//server/share/file")).toBe("//server/share/file");
    expect(normalize("\\\\server\\share\\file")).toBe("//server/share/file");
    expect(normalize("//server/share/foo/../bar")).toBe("//server/share/bar");
  });

  it("is idempotent", () => {
    const inputs = ["/foo/bar", "C:/foo", "//server/share/x", "../foo", "."];
    for (const input of inputs) {
      const once = normalize(input);
      const twice = normalize(once);
      expect(twice).toBe(once);
    }
  });
});

describe("basename", () => {
  it("returns last path segment", () => {
    expect(basename("/foo/bar/baz.txt")).toBe("baz.txt");
    expect(basename("foo/bar")).toBe("bar");
  });

  it("handles backslash separators", () => {
    expect(basename("C:\\foo\\bar.txt")).toBe("bar.txt");
  });

  it("returns empty string for root paths", () => {
    expect(basename("/")).toBe("");
    expect(basename("C:/")).toBe("");
  });

  it("strips trailing slashes before extracting", () => {
    expect(basename("/foo/bar/")).toBe("bar");
  });

  it("handles single-segment paths", () => {
    expect(basename("foo")).toBe("foo");
  });
});

describe("dirname", () => {
  it("returns parent directory", () => {
    expect(dirname("/foo/bar/baz")).toBe("/foo/bar");
    expect(dirname("foo/bar")).toBe("foo");
  });

  it("returns '/' for top-level absolute paths", () => {
    expect(dirname("/foo")).toBe("/");
  });

  it("returns '.' for top-level relative paths", () => {
    expect(dirname("foo")).toBe(".");
  });

  it("preserves drive prefix for top-level Windows paths", () => {
    expect(dirname("C:/foo")).toBe("C:/");
  });

  it("returns root for root", () => {
    expect(dirname("/")).toBe("/");
    expect(dirname("C:/")).toBe("C:/");
  });
});

describe("resolve", () => {
  it("joins relative segments", () => {
    expect(resolve("foo", "bar")).toBe("foo/bar");
  });

  it("resets when a later segment is absolute", () => {
    expect(resolve("/foo", "/bar")).toBe("/bar");
    expect(resolve("/a", "b", "/c")).toBe("/c");
  });

  it("preserves an absolute base when later segments are relative", () => {
    expect(resolve("/Users/foo", "bar/baz")).toBe("/Users/foo/bar/baz");
  });

  it("normalizes the result", () => {
    expect(resolve("/foo", "bar/../baz")).toBe("/foo/baz");
  });

  it("returns '.' for no input", () => {
    expect(resolve()).toBe(".");
    expect(resolve("", "")).toBe(".");
  });
});

describe("join", () => {
  it("concatenates segments with '/'", () => {
    expect(join("foo", "bar")).toBe("foo/bar");
    expect(join("/Users/foo", "bar")).toBe("/Users/foo/bar");
  });

  it("does NOT reset on an absolute later segment (unlike resolve)", () => {
    expect(join("/a", "/b")).toBe("/a/b");
    expect(join("foo", "/bar")).toBe("foo/bar");
  });

  it("normalizes the joined result", () => {
    expect(join("/foo/", "/bar")).toBe("/foo/bar");
    expect(join("foo", "..", "bar")).toBe("bar");
    expect(join("/foo", "./bar")).toBe("/foo/bar");
  });

  it("filters empty segments", () => {
    expect(join("foo", "", "bar")).toBe("foo/bar");
    expect(join("", "", "")).toBe(".");
  });

  it("returns '.' for no input", () => {
    expect(join()).toBe(".");
  });

  it("handles Windows drive prefixes", () => {
    expect(join("C:/Users", "foo")).toBe("C:/Users/foo");
  });
});

describe("cross-platform output stability", () => {
  it("always emits forward slashes regardless of input separator", () => {
    expect(normalize("foo\\bar")).toMatch(/^[^\\]*$/);
    expect(join("foo\\bar", "baz")).toMatch(/^[^\\]*$/);
    expect(resolve("foo\\bar", "baz")).toMatch(/^[^\\]*$/);
    expect(dirname("foo\\bar\\baz")).toMatch(/^[^\\]*$/);
  });
});
