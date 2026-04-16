#!/usr/bin/env node
// Validates a generated electron-updater metadata file (latest.yml,
// nightly-mac.yml, beta-linux.yml, etc.). Checks that version matches
// package.json, files[] is populated, and every file has a sha512.
//
// Existence checks only would let a silently-broken publish config ship
// (e.g. missing `provider: generic` after a merge glitch, or a stale
// version string) — the bytes are signed but the feed pointer would be
// wrong, and we'd find out via a production 404.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";

const [metadataPath] = process.argv.slice(2);
if (!metadataPath) {
  console.error("Usage: validate-update-metadata.mjs <path-to-yml>");
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.resolve(here, "../../package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

const data = load(readFileSync(metadataPath, "utf8"));

const fail = (msg) => {
  console.error(`::error file=${metadataPath}::${msg}`);
  process.exit(1);
};

if (data.version !== pkg.version) {
  fail(`version mismatch: yml=${data.version} package.json=${pkg.version}`);
}
if (!Array.isArray(data.files) || data.files.length === 0) {
  fail("files[] is missing or empty — updater has nothing to download");
}
for (const f of data.files) {
  if (!f.url) fail("file entry missing url");
  if (!f.sha512) fail(`file entry missing sha512 for ${f.url}`);
  if (typeof f.size !== "number" || f.size <= 0) {
    fail(`file entry missing or invalid size for ${f.url}`);
  }
}
if (!data.path) fail("top-level path missing");
if (!data.sha512) fail("top-level sha512 missing");
if (!data.releaseDate) fail("releaseDate missing");

console.log(
  `[validate] ${metadataPath}: version=${data.version}, ${data.files.length} file(s), all sha512 present`
);
