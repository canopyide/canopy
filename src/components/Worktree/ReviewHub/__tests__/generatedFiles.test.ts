import { describe, it, expect } from "vitest";
import { isGeneratedFile } from "../generatedFiles";

describe("isGeneratedFile", () => {
  it("matches well-known lockfiles by basename", () => {
    expect(isGeneratedFile("package-lock.json")).toBe(true);
    expect(isGeneratedFile("yarn.lock")).toBe(true);
    expect(isGeneratedFile("pnpm-lock.yaml")).toBe(true);
    expect(isGeneratedFile("bun.lockb")).toBe(true);
    expect(isGeneratedFile("Cargo.lock")).toBe(true);
    expect(isGeneratedFile("Gemfile.lock")).toBe(true);
    expect(isGeneratedFile("composer.lock")).toBe(true);
    expect(isGeneratedFile("Pipfile.lock")).toBe(true);
    expect(isGeneratedFile("poetry.lock")).toBe(true);
    expect(isGeneratedFile("go.sum")).toBe(true);
  });

  it("matches lockfiles nested in subdirectories", () => {
    expect(isGeneratedFile("packages/app/package-lock.json")).toBe(true);
    expect(isGeneratedFile("services/api/Cargo.lock")).toBe(true);
  });

  it("matches minified, snapshot, protobuf, and *.generated.* artifacts", () => {
    expect(isGeneratedFile("vendor/library.min.js")).toBe(true);
    expect(isGeneratedFile("styles.min.css")).toBe(true);
    expect(isGeneratedFile("module.min.mjs")).toBe(true);
    expect(isGeneratedFile("src/__snapshots__/component.snap")).toBe(true);
    expect(isGeneratedFile("proto/messages.pb.go")).toBe(true);
    expect(isGeneratedFile("proto/messages.pb.ts")).toBe(true);
    expect(isGeneratedFile("proto/messages.pb.d.ts")).toBe(true);
    expect(isGeneratedFile("src/api.generated.ts")).toBe(true);
    expect(isGeneratedFile("schema.generated.graphql")).toBe(true);
  });

  it("matches build-output directories", () => {
    expect(isGeneratedFile("dist/bundle.js")).toBe(true);
    expect(isGeneratedFile("build/index.html")).toBe(true);
    expect(isGeneratedFile(".next/cache/manifest.json")).toBe(true);
    expect(isGeneratedFile(".nuxt/server.js")).toBe(true);
    expect(isGeneratedFile(".svelte-kit/output.js")).toBe(true);
    expect(isGeneratedFile("coverage/lcov.info")).toBe(true);
    expect(isGeneratedFile("packages/app/dist/index.js")).toBe(true);
  });

  it("normalizes backslashes for Windows-style paths", () => {
    expect(isGeneratedFile("packages\\app\\dist\\bundle.js")).toBe(true);
    expect(isGeneratedFile("packages\\app\\package-lock.json")).toBe(true);
  });

  it("does not flag hand-written source files", () => {
    expect(isGeneratedFile("src/index.ts")).toBe(false);
    expect(isGeneratedFile("src/component.tsx")).toBe(false);
    expect(isGeneratedFile("README.md")).toBe(false);
    expect(isGeneratedFile("CHANGELOG.md")).toBe(false);
    expect(isGeneratedFile("types/foo.d.ts")).toBe(false);
    expect(isGeneratedFile("docs/guide.md")).toBe(false);
  });

  it("does not flag files merely containing 'dist' in their name", () => {
    expect(isGeneratedFile("src/distance.ts")).toBe(false);
    expect(isGeneratedFile("redistribution.md")).toBe(false);
  });

  it("returns false for empty input", () => {
    expect(isGeneratedFile("")).toBe(false);
  });
});
