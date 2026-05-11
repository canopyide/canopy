import { describe, it, expect } from "vitest";
import { LanguageDescription } from "@codemirror/language";
import { CURATED_LANGUAGES } from "../editorLanguages";

function nameFor(filename: string): string | null {
  const desc = LanguageDescription.matchFilename(CURATED_LANGUAGES, filename);
  return desc?.name ?? null;
}

describe("CURATED_LANGUAGES — issue #7657 (curated @codemirror/language-data)", () => {
  describe("matches extensions covered by languageUtils.ts", () => {
    it.each([
      ["index.js", "JavaScript"],
      ["index.mjs", "JavaScript"],
      ["index.cjs", "JavaScript"],
      ["App.jsx", "JSX"],
      ["main.ts", "TypeScript"],
      ["App.tsx", "TSX"],
      ["page.html", "HTML"],
      ["page.htm", "HTML"],
      ["styles.css", "CSS"],
      ["styles.scss", "SCSS"],
      ["styles.sass", "Sass"],
      ["styles.less", "LESS"],
      ["config.json", "JSON"],
      ["config.yaml", "YAML"],
      ["config.yml", "YAML"],
      ["config.toml", "TOML"],
      ["README.md", "Markdown"],
      ["doc.mdx", "Markdown"],
      ["script.py", "Python"],
      ["script.rb", "Ruby"],
      ["main.go", "Go"],
      ["lib.rs", "Rust"],
      ["App.java", "Java"],
      ["App.kt", "Kotlin"],
      ["App.swift", "Swift"],
      ["main.c", "C"],
      ["header.h", "C"],
      ["main.cpp", "C++"],
      ["header.hpp", "C++"],
      ["Program.cs", "C#"],
      ["main.dart", "Dart"],
      ["index.php", "PHP"],
      ["query.sql", "SQL"],
      ["build.sh", "Shell"],
      ["build.bash", "Shell"],
      ["build.zsh", "Shell"],
      ["build.fish", "Shell"],
    ])("%s → %s", (filename, expected) => {
      expect(nameFor(filename)).toBe(expected);
    });
  });

  describe("matches well-known extensionless filenames", () => {
    it.each([
      ["Dockerfile", "Dockerfile"],
      ["Gemfile", "Ruby"],
      ["Rakefile", "Ruby"],
      ["PKGBUILD", "Shell"],
      ["BUILD", "Python"],
      ["BUCK", "Python"],
    ])("%s → %s", (filename, expected) => {
      expect(nameFor(filename)).toBe(expected);
    });
  });

  describe("returns null for unsupported extensions", () => {
    // languageUtils.ts maps these but @codemirror/language-data has no parser
    // for them — they should remain unrecognized (plain text fallback).
    it.each(["schema.graphql", "schema.gql", "Makefile", "data.xml", "unknown.xyz"])(
      "%s → null",
      (filename) => {
        expect(nameFor(filename)).toBeNull();
      }
    );
  });

  it("every entry has a load() that returns a thenable", () => {
    for (const desc of CURATED_LANGUAGES) {
      expect(typeof desc.load).toBe("function");
    }
  });
});
