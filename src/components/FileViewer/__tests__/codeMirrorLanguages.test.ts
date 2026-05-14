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

  it("resolves .v to SystemVerilog (declared before Verilog)", () => {
    const desc = LanguageDescription.matchFilename(CODEMIRROR_LANGUAGES, "foo.v");
    expect(desc?.name).toBe("SystemVerilog");
  });

  it("resolves .sig to PGP (declared before SML)", () => {
    const desc = LanguageDescription.matchFilename(CODEMIRROR_LANGUAGES, "foo.sig");
    expect(desc?.name).toBe("PGP");
  });
});

describe("CODEMIRROR_LANGUAGES — filename regex boundaries", () => {
  it.each([
    ["Dockerfile", "Dockerfile"],
    ["Gemfile", "Ruby"],
    ["Rakefile", "Ruby"],
    ["Jenkinsfile", "Groovy"],
    ["BUCK", "Python"],
    ["BUILD", "Python"],
    ["PKGBUILD", "Shell"],
    ["CMakeLists.txt", "CMake"],
    ["extensions.conf", "Asterisk"],
    ["my-nginx.conf", "Nginx"],
  ])("filename %s matches %s", (filename, expectedName) => {
    const desc = LanguageDescription.matchFilename(CODEMIRROR_LANGUAGES, filename);
    expect(desc?.name).toBe(expectedName);
  });

  it.each([["Dockerfile.dev"], ["myGemfile"], ["myJenkinsfile"]])(
    "filename %s does NOT match a regex-only entry",
    (filename) => {
      // Anchors (`^...$`) prevent partial matches; these names should fall through to null.
      const desc = LanguageDescription.matchFilename(CODEMIRROR_LANGUAGES, filename);
      expect(desc).toBeNull();
    }
  );
});

describe("CODEMIRROR_LANGUAGES — load() round-trip for representative entries", () => {
  // Guards against typos in legacy-modes export names (`m.csharp` vs `m.cSharp`)
  // or dialect identifiers in lang-sql that `typeof load === "function"` can't catch.
  // Targeted subset; full coverage would require loading every parser at test time.
  const samples = ["TypeScript", "SQL", "CQL", "PLSQL", "C#", "TOML", "Shell", "Vue"];

  it.each(samples)("%s loads without rejection", async (name) => {
    const desc = CODEMIRROR_LANGUAGES.find((d) => d.name === name);
    expect(desc).toBeDefined();
    const support = await desc!.load();
    expect(support).toBeDefined();
  });
});
