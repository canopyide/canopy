import { describe, it, expect } from "vitest";
import { LanguageDescription } from "@codemirror/language";
import { CODEMIRROR_LANGUAGES } from "../codeMirrorLanguages";

describe("CODEMIRROR_LANGUAGES — curated registry shape", () => {
  it("is a non-empty array of LanguageDescription instances", () => {
    expect(Array.isArray(CODEMIRROR_LANGUAGES)).toBe(true);
    expect(CODEMIRROR_LANGUAGES.length).toBeGreaterThan(0);
    for (const desc of CODEMIRROR_LANGUAGES) {
      expect(desc).toBeInstanceOf(LanguageDescription);
    }
  });

  it("has no duplicate names", () => {
    const names = CODEMIRROR_LANGUAGES.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every entry has at least one extension or filename matcher", () => {
    for (const desc of CODEMIRROR_LANGUAGES) {
      const hasExt = Array.isArray(desc.extensions) && desc.extensions.length > 0;
      const hasFilename = desc.filename instanceof RegExp;
      expect(hasExt || hasFilename).toBe(true);
    }
  });

  it("every entry has a callable load function", () => {
    for (const desc of CODEMIRROR_LANGUAGES) {
      expect(typeof desc.load).toBe("function");
    }
  });
});

describe("CODEMIRROR_LANGUAGES — matchFilename coverage for common file types", () => {
  const cases: Array<[string, string]> = [
    ["foo.ts", "TypeScript"],
    ["foo.tsx", "TSX"],
    ["foo.jsx", "JSX"],
    ["foo.js", "JavaScript"],
    ["foo.mjs", "JavaScript"],
    ["foo.cjs", "JavaScript"],
    ["foo.json", "JSON"],
    ["foo.py", "Python"],
    ["foo.rs", "Rust"],
    ["foo.go", "Go"],
    ["foo.html", "HTML"],
    ["foo.css", "CSS"],
    ["foo.scss", "SCSS"],
    ["foo.sass", "Sass"],
    ["foo.less", "LESS"],
    ["foo.xml", "XML"],
    ["foo.svg", "XML"],
    ["foo.yaml", "YAML"],
    ["foo.yml", "YAML"],
    ["foo.md", "Markdown"],
    ["foo.sh", "Shell"],
    ["foo.bash", "Shell"],
    ["foo.rb", "Ruby"],
    ["Gemfile", "Ruby"],
    ["Rakefile", "Ruby"],
    ["foo.lua", "Lua"],
    ["Dockerfile", "Dockerfile"],
    ["foo.sql", "SQL"],
    ["foo.cs", "C#"],
    ["foo.kt", "Kotlin"],
    ["foo.dart", "Dart"],
    ["foo.scala", "Scala"],
    ["foo.swift", "Swift"],
    ["foo.toml", "TOML"],
    ["foo.proto", "ProtoBuf"],
    ["foo.pl", "Perl"],
    ["foo.cpp", "C++"],
    ["foo.c", "C"],
    ["foo.php", "PHP"],
    ["foo.java", "Java"],
    ["foo.vue", "Vue"],
    ["CMakeLists.txt", "CMake"],
    ["foo.r", "R"],
  ];

  it.each(cases)("matches %s to %s", (filename, expectedName) => {
    const desc = LanguageDescription.matchFilename(CODEMIRROR_LANGUAGES, filename);
    expect(desc).not.toBeNull();
    expect(desc?.name).toBe(expectedName);
  });

  it.each([["foo.unknown"], ["foo"], [""]])("returns null for %s", (filename) => {
    const desc = LanguageDescription.matchFilename(CODEMIRROR_LANGUAGES, filename);
    expect(desc).toBeNull();
  });

  it("resolves .m to Mathematica (upstream order: Mathematica → Objective-C → Octave)", () => {
    // matchFilename is first-match-wins. Three entries claim `.m` (Mathematica,
    // Objective-C, Octave). Preserving upstream order keeps behavior parity.
    const desc = LanguageDescription.matchFilename(CODEMIRROR_LANGUAGES, "foo.m");
    expect(desc?.name).toBe("Mathematica");
  });
});
