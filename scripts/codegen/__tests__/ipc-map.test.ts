import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error — .mjs ESM module with no .d.ts; we only consume the exported function.
import { generateIpcMap } from "../ipc-map.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, "fixtures");
const FIXTURE_TSCONFIG = path.join(FIXTURES_DIR, "tsconfig.json");

function runFixture(extraFilter?: (filePath: string) => boolean): Promise<string> {
  return generateIpcMap({
    tsConfigFilePath: FIXTURE_TSCONFIG,
    filter: (fp: string) =>
      fp.startsWith(FIXTURES_DIR) &&
      fp.endsWith("handlers.ts") &&
      (extraFilter ? extraFilter(fp) : true),
    outputDir: FIXTURES_DIR,
  });
}

describe("ipc-map codegen", () => {
  it("emits an entry per op() and opValidated() call", async () => {
    const output = await runFixture();
    expect(output).toContain('"fixture:no-args"');
    expect(output).toContain('"fixture:string-arg"');
    expect(output).toContain('"fixture:multi-arg"');
    expect(output).toContain('"fixture:object-result"');
    expect(output).toContain('"fixture:validated"');
    expect(output).toContain('"fixture:with-context"');
    expect(output).toContain('"fixture:inside-fn"');
  });

  it("sorts entries alphabetically by channel", async () => {
    const output = await runFixture();
    const channels: string[] = [];
    for (const line of output.split("\n")) {
      const m = line.match(/^\s+"([^"]+)":\s*\{\s*$/);
      if (m) channels.push(m[1]!);
    }
    const sorted = [...channels].sort((a, b) => a.localeCompare(b));
    expect(channels).toEqual(sorted);
  });

  it("emits empty args tuple for a no-arg handler", async () => {
    const output = await runFixture();
    const match = output.match(/"fixture:no-args":\s*\{\s*args:\s*([^;]+);\s*result:\s*([^;]+);/);
    expect(match).not.toBeNull();
    expect(match![1]!.trim()).toBe("[]");
    expect(match![2]!.trim()).toBe("number");
  });

  it("preserves named tuple labels from declared parameter types", async () => {
    const output = await runFixture();
    expect(output).toMatch(/"fixture:string-arg":\s*\{\s*args:\s*\[name:\s*string\]/);
    expect(output).toMatch(
      /"fixture:multi-arg":\s*\{\s*args:\s*\[id:\s*string,\s*count:\s*number\]/
    );
  });

  it("collapses Promise<boolean> return to `boolean` rather than `false | true`", async () => {
    const output = await runFixture();
    expect(output).toMatch(/"fixture:multi-arg":[\s\S]*?result:\s*boolean;/);
    expect(output).not.toContain("false | true");
  });

  it("emits inline-object results without inventing names", async () => {
    const output = await runFixture();
    expect(output).toMatch(
      /"fixture:object-result":[\s\S]*?result:\s*\{[^}]*value:\s*string[^}]*ok:\s*true[^}]*\}/
    );
  });

  it("strips the ctx parameter from withContext handlers", async () => {
    const output = await runFixture();
    // ctx (first parameter) must NOT appear in the args tuple.
    expect(output).toMatch(/"fixture:with-context":\s*\{\s*args:\s*\[id:\s*string\]/);
    expect(output).not.toMatch(/"fixture:with-context":[\s\S]*?args:[^[]*\[_ctx:/);
  });

  it("emits a single payload arg for opValidated()", async () => {
    const output = await runFixture();
    expect(output).toMatch(/"fixture:validated":\s*\{\s*args:\s*\[payload:\s*[^\]]+\]/);
  });

  it("walks into defineIpcNamespace calls inside function bodies", async () => {
    const output = await runFixture();
    expect(output).toMatch(/"fixture:inside-fn":[\s\S]*?result:\s*string\[\]/);
  });

  it("emits the GeneratedIpcInvokeMap interface and a do-not-edit header", async () => {
    const output = await runFixture();
    expect(output).toContain("export interface GeneratedIpcInvokeMap {");
    expect(output).toContain("AUTO-GENERATED");
    expect(output).toContain("do not edit by hand");
  });
});
