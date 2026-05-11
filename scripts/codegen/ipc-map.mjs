#!/usr/bin/env node
// Generates shared/types/ipc/generated.ts from defineIpcNamespace blocks in
// electron/ipc/handlers/. Walks each handler file with ts-morph, resolves
// op()/opValidated() call expressions, extracts the channel string and
// argument/return types from the handler function declarations, and emits a
// `GeneratedIpcInvokeMap` interface that maps.ts extends.
//
// Usage:
//   node scripts/codegen/ipc-map.mjs            # write generated.ts
//   node scripts/codegen/ipc-map.mjs --check    # CI-only — exit 1 if stale
//
// Type printing strategy:
//   ts-morph type.getText() is called WITHOUT an enclosing-node argument so the
//   compiler emits inline `import("/abs/path").TypeName` references for every
//   non-local type. We then rewrite those absolute paths to project-relative
//   paths with `.js` extensions so the generated file resolves under NodeNext
//   from its location at shared/types/ipc/generated.ts.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Project, SyntaxKind, Node } from "ts-morph";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "..", "..");

const TSCONFIG_PATH = path.join(REPO_ROOT, "electron", "tsconfig.json");
const OUTPUT_PATH = path.join(REPO_ROOT, "shared", "types", "ipc", "generated.ts");

// ts-morph normalizes file paths to forward slashes on every platform (it
// goes through the TypeScript compiler API which always emits POSIX-style
// separators), so the directory checks below use literal "/" rather than
// path.sep. Using path.sep would silently match nothing on Windows CI.
function isExcludedHandlerFile(filePath) {
  if (filePath.endsWith(".preload.ts")) return true;
  if (filePath.endsWith(".d.ts")) return true;
  if (filePath.includes("/__tests__/")) return true;
  return false;
}

const defaultHandlerFilter = (filePath) =>
  filePath.includes("/electron/ipc/handlers/") && !isExcludedHandlerFile(filePath);

const defaultRenderOptions = { outputDir: path.dirname(OUTPUT_PATH) };

export async function generateIpcMap({
  tsConfigFilePath = TSCONFIG_PATH,
  filter = defaultHandlerFilter,
  outputDir = defaultRenderOptions.outputDir,
} = {}) {
  const project = new Project({
    tsConfigFilePath,
    skipAddingFilesFromTsConfig: false,
  });

  const handlerFiles = project.getSourceFiles().filter((sf) => filter(sf.getFilePath()));

  const entries = [];
  const seen = new Map();
  for (const sourceFile of handlerFiles) {
    const calls = collectDefineIpcNamespaceCalls(sourceFile);
    for (const call of calls) {
      const namespaceEntries = extractNamespaceEntries(call, sourceFile, { outputDir });
      for (const entry of namespaceEntries) {
        const prior = seen.get(entry.channel);
        if (prior) {
          throw new Error(
            `[ipc-map codegen] duplicate channel "${entry.channel}" registered in ${prior} and ${entry.sourceFile}`
          );
        }
        seen.set(entry.channel, entry.sourceFile);
        entries.push(entry);
      }
    }
  }

  entries.sort((a, b) => a.channel.localeCompare(b.channel));
  return renderOutput(entries);
}

function collectDefineIpcNamespaceCalls(sourceFile) {
  const out = [];
  sourceFile.forEachDescendant((node) => {
    if (!Node.isCallExpression(node)) return;
    if (node.getExpression().getText() !== "defineIpcNamespace") return;
    out.push(node);
  });
  return out;
}

function extractNamespaceEntries(call, sourceFile, options) {
  const args = call.getArguments();
  if (args.length === 0) {
    throw codegenError(
      `defineIpcNamespace requires an argument`,
      sourceFile.getFilePath(),
      call.getStartLineNumber()
    );
  }
  const inputArg = args[0];
  if (!Node.isObjectLiteralExpression(inputArg)) {
    throw codegenError(
      `defineIpcNamespace argument must be an object literal`,
      sourceFile.getFilePath(),
      call.getStartLineNumber()
    );
  }

  const opsProp = inputArg.getProperty("ops");
  if (!opsProp || !Node.isPropertyAssignment(opsProp)) {
    throw codegenError(
      `defineIpcNamespace argument missing 'ops' property assignment`,
      sourceFile.getFilePath(),
      call.getStartLineNumber()
    );
  }
  const opsObj = opsProp.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
  if (!opsObj) {
    throw codegenError(
      `'ops' must be an object literal`,
      sourceFile.getFilePath(),
      opsProp.getStartLineNumber()
    );
  }

  const entries = [];
  for (const prop of opsObj.getProperties()) {
    if (Node.isPropertyAssignment(prop)) {
      const initializer = prop.getInitializer();
      if (!initializer || !Node.isCallExpression(initializer)) {
        throw codegenError(
          `Each op in 'ops' must be a call to op() or opValidated()`,
          sourceFile.getFilePath(),
          prop.getStartLineNumber()
        );
      }
      entries.push(extractOpEntry(initializer, sourceFile, options));
      continue;
    }
    if (Node.isShorthandPropertyAssignment(prop)) {
      // Shorthand `{ foo }` means foo is a CallExpression value imported or
      // declared elsewhere — we don't try to follow it; require explicit
      // assignment for unambiguous extraction.
      throw codegenError(
        `Shorthand property '${prop.getName()}' in 'ops' is not supported — assign with op() or opValidated()`,
        sourceFile.getFilePath(),
        prop.getStartLineNumber()
      );
    }
  }
  return entries;
}

function extractOpEntry(opCall, sourceFile, options) {
  const callee = opCall.getExpression().getText();
  const isValidated = callee === "opValidated";
  if (callee !== "op" && callee !== "opValidated") {
    throw codegenError(
      `Expected op() or opValidated(), got ${callee}()`,
      sourceFile.getFilePath(),
      opCall.getStartLineNumber()
    );
  }

  const args = opCall.getArguments();
  const minArgs = isValidated ? 3 : 2;
  if (args.length < minArgs) {
    throw codegenError(
      `${callee}() requires ${isValidated ? "channel, schema, handler" : "channel and handler"}`,
      sourceFile.getFilePath(),
      opCall.getStartLineNumber()
    );
  }

  const channelArg = args[0];
  const channel = resolveStringLiteralType(channelArg, sourceFile);

  const handlerArg = isValidated ? args[2] : args[1];
  const optionsArg = isValidated ? args[3] : args[2];

  const withContext = optionsArg ? evaluateWithContextOption(optionsArg, sourceFile) : false;

  const handlerType = handlerArg.getType();
  const callSignatures = handlerType.getCallSignatures();
  if (callSignatures.length === 0) {
    throw codegenError(
      `Handler for ${channel} has no call signature`,
      sourceFile.getFilePath(),
      handlerArg.getStartLineNumber()
    );
  }
  const signature = callSignatures[0];
  const params = signature.getParameters();

  const argsText = buildArgsTypeText({
    params,
    withContext,
    isValidated,
    callerNode: handlerArg,
    channel,
    sourceFile,
    options,
  });

  const resultText = formatReturnType(
    signature.getReturnType(),
    handlerArg,
    channel,
    sourceFile,
    options
  );

  return {
    channel,
    argsText,
    resultText,
    sourceFile: path.relative(REPO_ROOT, sourceFile.getFilePath()),
  };
}

function resolveStringLiteralType(node, sourceFile) {
  const type = node.getType();
  const value = type.getLiteralValue();
  if (typeof value === "string") return value;
  if (Node.isStringLiteral(node)) return node.getLiteralValue();
  throw codegenError(
    `Could not resolve channel argument to a string literal (got type ${type.getText()})`,
    sourceFile.getFilePath(),
    node.getStartLineNumber()
  );
}

function evaluateWithContextOption(optionsNode, sourceFile) {
  if (!Node.isObjectLiteralExpression(optionsNode)) {
    throw codegenError(
      `op() options argument must be an inline object literal`,
      sourceFile.getFilePath(),
      optionsNode.getStartLineNumber()
    );
  }
  const prop = optionsNode.getProperty("withContext");
  if (!prop) return false;
  if (!Node.isPropertyAssignment(prop)) {
    throw codegenError(
      `'withContext' option must be a property assignment`,
      sourceFile.getFilePath(),
      prop.getStartLineNumber()
    );
  }
  const init = prop.getInitializer();
  if (!init) return false;
  const text = init.getText();
  if (text === "true") return true;
  if (text === "false") return false;
  throw codegenError(
    `'withContext' option must be a literal true or false (got ${text})`,
    sourceFile.getFilePath(),
    prop.getStartLineNumber()
  );
}

function buildArgsTypeText({
  params,
  withContext,
  isValidated,
  callerNode,
  channel,
  sourceFile,
  options,
}) {
  const trimmed = withContext ? params.slice(1) : params;
  if (isValidated && trimmed.length > 1) {
    throw codegenError(
      `opValidated handler for ${channel} declares ${trimmed.length} parameters — only the validated payload is supported`,
      sourceFile.getFilePath(),
      callerNode.getStartLineNumber()
    );
  }
  if (trimmed.length === 0) return "[]";

  const pieces = trimmed.map((param) => {
    const decl = param.getDeclarations()[0];
    if (!decl) {
      throw codegenError(
        `Handler parameter for ${channel} has no declaration`,
        sourceFile.getFilePath(),
        callerNode.getStartLineNumber()
      );
    }
    const name = param.getName();
    const isOptional = Node.isParameterDeclaration(decl) ? decl.isOptional() : false;
    // Use type-at-location without enclosing scope so imports are emitted as
    // inline `import("/abs/path").Name` references; we rewrite paths below.
    const typeText = formatType(param.getTypeAtLocation(callerNode), options);
    return `${name}${isOptional ? "?" : ""}: ${typeText}`;
  });
  return `[${pieces.join(", ")}]`;
}

function formatReturnType(returnType, callerNode, channel, sourceFile, options) {
  const guard = (text) => {
    if (text === "any" || text === "unknown") {
      throw codegenError(
        `Handler return type for ${channel} resolves to '${text}' — give the handler an explicit return type`,
        sourceFile.getFilePath(),
        callerNode.getStartLineNumber()
      );
    }
    return text;
  };

  let unwrapped = returnType;
  if (isPromiseType(unwrapped)) {
    unwrapped = unwrapped.getTypeArguments()[0];
  } else if (unwrapped.isUnion()) {
    // Handle `T | Promise<T>` style — unwrap Promise branches while leaving
    // other union members intact.
    const branches = unwrapped.getUnionTypes();
    const hasPromise = branches.some(isPromiseType);
    if (hasPromise) {
      const flat = branches.map((b) => (isPromiseType(b) ? b.getTypeArguments()[0] : b));
      const seen = new Set();
      const deduped = [];
      for (const t of flat) {
        const key = formatType(t, options);
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(t);
      }
      if (deduped.length === 1) {
        unwrapped = deduped[0];
      } else {
        const parts = deduped.map((t) => guard(formatType(t, options)));
        return parts.join(" | ");
      }
    }
  }
  return guard(formatType(unwrapped, options));
}

function isPromiseType(t) {
  const sym = t.getSymbol() ?? t.getAliasSymbol();
  return sym?.getName() === "Promise" && t.getTypeArguments().length === 1;
}

// Print a type with no enclosing scope, then rewrite absolute inline-import
// paths to be relative to the generated.ts output.
function formatType(type, options) {
  const raw = type.getText();
  return rewriteInlineImports(raw, options);
}

function rewriteInlineImports(text, options) {
  const outputDir = options?.outputDir ?? path.dirname(OUTPUT_PATH);
  return text.replace(/import\(("([^"]+)"|'([^']+)')\)/g, (_match, _g1, dq, sq) => {
    const absPath = dq ?? sq;
    // path.isAbsolute correctly handles both POSIX (`/foo`) and Windows
    // (`C:/foo` or `C:\foo`) shapes; ts-morph uses POSIX-style on every
    // platform but path.isAbsolute is the safer guard.
    if (!path.isAbsolute(absPath)) {
      return `import("${absPath}")`;
    }
    let rel = path.relative(outputDir, absPath);
    rel = rel.replace(/\\/g, "/");
    if (!rel.startsWith(".")) rel = `./${rel}`;
    // ts-morph emits paths without an extension; NodeNext resolution from a
    // .ts source requires the .js suffix.
    if (!/\.[tj]sx?$/.test(rel)) rel = `${rel}.js`;
    return `import("${rel}")`;
  });
}

function renderOutput(entries) {
  const header = `// AUTO-GENERATED by scripts/codegen/ipc-map.mjs — do not edit by hand.
// Run \`npm run codegen:ipc\` to regenerate. Source: defineIpcNamespace blocks
// in electron/ipc/handlers/. The hand-maintained IpcInvokeMap in maps.ts
// extends this interface.
/* eslint-disable */

`;

  const body = ["export interface GeneratedIpcInvokeMap {"];
  for (const entry of entries) {
    body.push(`  ${JSON.stringify(entry.channel)}: {`);
    body.push(`    args: ${entry.argsText};`);
    body.push(`    result: ${entry.resultText};`);
    body.push(`  };`);
  }
  body.push("}");
  body.push("");
  return header + body.join("\n");
}

function codegenError(message, filePath, line) {
  const rel = path.relative(REPO_ROOT, filePath);
  const err = new Error(`[ipc-map codegen] ${rel}:${line}: ${message}`);
  err.filePath = filePath;
  err.line = line;
  return err;
}

function normalizeLineEndings(s) {
  return s.replace(/\r\n/g, "\n");
}

async function loadPrettier() {
  try {
    return await import("prettier");
  } catch {
    return null;
  }
}

async function format(content) {
  const prettier = await loadPrettier();
  if (!prettier) return content;
  return prettier.format(content, {
    parser: "typescript",
    filepath: OUTPUT_PATH,
  });
}

async function main() {
  const checkMode = process.argv.includes("--check");

  let generated;
  try {
    generated = await generateIpcMap();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const formatted = normalizeLineEndings(await format(generated));

  if (checkMode) {
    if (!existsSync(OUTPUT_PATH)) {
      console.error(
        `::error file=${path.relative(REPO_ROOT, OUTPUT_PATH)}::missing generated file — run \`npm run codegen:ipc\` and commit the result.`
      );
      process.exit(1);
    }
    const actual = normalizeLineEndings(readFileSync(OUTPUT_PATH, "utf8"));
    if (actual !== formatted) {
      console.error(
        `::error file=${path.relative(REPO_ROOT, OUTPUT_PATH)}::${path.relative(REPO_ROOT, OUTPUT_PATH)} is out of sync with handler source. Run \`npm run codegen:ipc\` and commit the result.`
      );
      process.exit(1);
    }
    console.log("[ipc-map] OK — generated.ts matches handler sources");
    return;
  }

  writeFileSync(OUTPUT_PATH, formatted);
  console.log(`[ipc-map] wrote ${path.relative(REPO_ROOT, OUTPUT_PATH)}`);
}

const isMain =
  import.meta.url === pathToFileURL(process.argv[1] ?? "").href ||
  (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]));

if (isMain) {
  main();
}
