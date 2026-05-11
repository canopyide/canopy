import { LanguageDescription, LanguageSupport, StreamLanguage } from "@codemirror/language";

// The full `languages` export from `@codemirror/language-data` pulls every
// `@codemirror/lang-*` and `@codemirror/legacy-modes/mode/*` into the
// `vendor-editor` chunk because the Rolldown `codeSplitting.groups` regex for
// `@codemirror/*` captures them eagerly (see vite.config.ts). Hand-rolling the
// subset we actually support drops the unused `import()` call sites entirely.
function legacy(parser: Parameters<typeof StreamLanguage.define>[0]): LanguageSupport {
  return new LanguageSupport(StreamLanguage.define(parser));
}

export const CURATED_LANGUAGES: LanguageDescription[] = [
  LanguageDescription.of({
    name: "C",
    extensions: ["c", "h"],
    load() {
      return import("@codemirror/lang-cpp").then((m) => m.cpp());
    },
  }),
  LanguageDescription.of({
    name: "C++",
    alias: ["cpp"],
    extensions: ["cpp", "c++", "cc", "cxx", "hpp", "h++", "hh", "hxx"],
    load() {
      return import("@codemirror/lang-cpp").then((m) => m.cpp());
    },
  }),
  LanguageDescription.of({
    name: "C#",
    alias: ["csharp", "cs"],
    extensions: ["cs"],
    load() {
      return import("@codemirror/legacy-modes/mode/clike").then((m) => legacy(m.csharp));
    },
  }),
  LanguageDescription.of({
    name: "CSS",
    extensions: ["css"],
    load() {
      return import("@codemirror/lang-css").then((m) => m.css());
    },
  }),
  LanguageDescription.of({
    name: "Dart",
    extensions: ["dart"],
    load() {
      return import("@codemirror/legacy-modes/mode/clike").then((m) => legacy(m.dart));
    },
  }),
  LanguageDescription.of({
    name: "Dockerfile",
    filename: /^Dockerfile$/,
    load() {
      return import("@codemirror/legacy-modes/mode/dockerfile").then((m) => legacy(m.dockerFile));
    },
  }),
  LanguageDescription.of({
    name: "Go",
    extensions: ["go"],
    load() {
      return import("@codemirror/lang-go").then((m) => m.go());
    },
  }),
  LanguageDescription.of({
    name: "HTML",
    alias: ["xhtml"],
    extensions: ["html", "htm"],
    load() {
      return import("@codemirror/lang-html").then((m) => m.html());
    },
  }),
  LanguageDescription.of({
    name: "Java",
    extensions: ["java"],
    load() {
      return import("@codemirror/lang-java").then((m) => m.java());
    },
  }),
  LanguageDescription.of({
    name: "JavaScript",
    alias: ["ecmascript", "js", "node"],
    extensions: ["js", "mjs", "cjs"],
    load() {
      return import("@codemirror/lang-javascript").then((m) => m.javascript());
    },
  }),
  LanguageDescription.of({
    name: "JSON",
    alias: ["json5"],
    extensions: ["json"],
    load() {
      return import("@codemirror/lang-json").then((m) => m.json());
    },
  }),
  LanguageDescription.of({
    name: "JSX",
    extensions: ["jsx"],
    load() {
      return import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true }));
    },
  }),
  LanguageDescription.of({
    name: "Kotlin",
    extensions: ["kt", "kts"],
    load() {
      return import("@codemirror/legacy-modes/mode/clike").then((m) => legacy(m.kotlin));
    },
  }),
  LanguageDescription.of({
    name: "LESS",
    extensions: ["less"],
    load() {
      return import("@codemirror/lang-less").then((m) => m.less());
    },
  }),
  LanguageDescription.of({
    name: "Markdown",
    // `mdx` is not in upstream language-data but `languageUtils.ts` treats it as
    // markdown; keep parity by routing it to the plain markdown parser.
    extensions: ["md", "mdx", "markdown", "mkd"],
    load() {
      return import("@codemirror/lang-markdown").then((m) => m.markdown());
    },
  }),
  LanguageDescription.of({
    name: "PHP",
    extensions: ["php", "php3", "php4", "php5", "php7", "phtml"],
    load() {
      return import("@codemirror/lang-php").then((m) => m.php());
    },
  }),
  LanguageDescription.of({
    name: "Python",
    extensions: ["py", "pyw"],
    filename: /^(BUCK|BUILD)$/,
    load() {
      return import("@codemirror/lang-python").then((m) => m.python());
    },
  }),
  LanguageDescription.of({
    name: "Ruby",
    alias: ["jruby", "macruby", "rake", "rb", "rbx"],
    extensions: ["rb"],
    filename: /^(Gemfile|Rakefile)$/,
    load() {
      return import("@codemirror/legacy-modes/mode/ruby").then((m) => legacy(m.ruby));
    },
  }),
  LanguageDescription.of({
    name: "Rust",
    extensions: ["rs"],
    load() {
      return import("@codemirror/lang-rust").then((m) => m.rust());
    },
  }),
  LanguageDescription.of({
    name: "Sass",
    extensions: ["sass"],
    load() {
      return import("@codemirror/lang-sass").then((m) => m.sass({ indented: true }));
    },
  }),
  LanguageDescription.of({
    name: "SCSS",
    extensions: ["scss"],
    load() {
      return import("@codemirror/lang-sass").then((m) => m.sass());
    },
  }),
  LanguageDescription.of({
    name: "Shell",
    alias: ["bash", "sh", "zsh"],
    // `fish` is mapped to bash in languageUtils.ts; bash highlighting is a
    // reasonable approximation for fish so we route it through the same parser.
    extensions: ["sh", "ksh", "bash", "zsh", "fish"],
    filename: /^PKGBUILD$/,
    load() {
      return import("@codemirror/legacy-modes/mode/shell").then((m) => legacy(m.shell));
    },
  }),
  LanguageDescription.of({
    name: "SQL",
    extensions: ["sql"],
    load() {
      return import("@codemirror/lang-sql").then((m) => m.sql());
    },
  }),
  LanguageDescription.of({
    name: "Swift",
    extensions: ["swift"],
    load() {
      return import("@codemirror/legacy-modes/mode/swift").then((m) => legacy(m.swift));
    },
  }),
  LanguageDescription.of({
    name: "TOML",
    extensions: ["toml"],
    load() {
      return import("@codemirror/legacy-modes/mode/toml").then((m) => legacy(m.toml));
    },
  }),
  LanguageDescription.of({
    name: "TSX",
    extensions: ["tsx"],
    load() {
      return import("@codemirror/lang-javascript").then((m) =>
        m.javascript({ jsx: true, typescript: true })
      );
    },
  }),
  LanguageDescription.of({
    name: "TypeScript",
    alias: ["ts"],
    extensions: ["ts", "mts", "cts"],
    load() {
      return import("@codemirror/lang-javascript").then((m) => m.javascript({ typescript: true }));
    },
  }),
  LanguageDescription.of({
    name: "YAML",
    alias: ["yml"],
    extensions: ["yaml", "yml"],
    load() {
      return import("@codemirror/lang-yaml").then((m) => m.yaml());
    },
  }),
];
