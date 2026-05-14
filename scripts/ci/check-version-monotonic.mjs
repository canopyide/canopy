#!/usr/bin/env node
// Blocks the release publish if the new version isn't strictly greater than the
// version currently advertised on the live update feed. electron-updater on
// stable runs with `allowDowngrade = false` (see electron/services/AutoUpdaterService.ts),
// so a regressed `latest-mac.yml` / `latest-linux.yml` permanently strands every
// installed client until a hand-rolled republish — see #7573.
//
// Reads the new version from the local artifacts already downloaded into
// `release/${UPDATE_METADATA_PREFIX}-{mac,linux}.yml`, fetches the same files
// from https://updates.daintree.org/releases/, and compares with `semver.gt`.
// Equal versions also fail (republishing the same version is the same footgun).
//
// Failure modes:
//   - 404 on the live feed         -> pass for that platform (first release in channel)
//   - any other HTTP / network err -> fail closed
//   - YAML parse / missing version -> fail closed
//   - mac and linux disagree on    -> fail closed (split-brain build)
//     the new version

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { load } from "js-yaml";
import semver from "semver";

const FEED_BASE_URL = "https://updates.daintree.org/releases";
const FETCH_TIMEOUT_MS = 15_000;
const PLATFORMS = ["mac", "linux", "win"];
const ALLOWED_PREFIXES = ["latest", "rc", "beta"];

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

export function extractVersion(parsed, label) {
  if (parsed === null || typeof parsed !== "object") {
    throw new Error(`${label}: expected a YAML mapping with a 'version' field`);
  }
  const raw = parsed.version;
  if (raw === undefined || raw === null) {
    throw new Error(`${label}: missing 'version' field`);
  }
  if (typeof raw !== "string") {
    // YAML parses bare numerics (`version: 1`) as JS numbers — reject so a
    // bad metadata file can't slip past `semver.valid` after coercion.
    throw new Error(
      `${label}: 'version' must be a string, got ${typeof raw} (${JSON.stringify(raw)})`
    );
  }
  if (!semver.valid(raw)) {
    throw new Error(`${label}: '${raw}' is not a valid semver version`);
  }
  return raw;
}

export function validatePrefix(prefix) {
  if (!prefix) {
    return {
      ok: false,
      error:
        "UPDATE_METADATA_PREFIX env var is not set — refusing to guess the channel. " +
        `Set it to one of: ${ALLOWED_PREFIXES.join(", ")}.`,
    };
  }
  if (!ALLOWED_PREFIXES.includes(prefix)) {
    return {
      ok: false,
      error:
        `UPDATE_METADATA_PREFIX='${prefix}' is not a known channel. ` +
        `Expected one of: ${ALLOWED_PREFIXES.join(", ")}.`,
    };
  }
  return { ok: true };
}

export function checkVersionMonotonic(liveVersion, newVersion) {
  if (!semver.valid(liveVersion)) {
    return { ok: false, error: `live version '${liveVersion}' is not valid semver` };
  }
  if (!semver.valid(newVersion)) {
    return { ok: false, error: `new version '${newVersion}' is not valid semver` };
  }
  if (!semver.gt(newVersion, liveVersion)) {
    return {
      ok: false,
      error: `new version ${newVersion} is not strictly greater than live ${liveVersion}`,
    };
  }
  return { ok: true };
}

async function fetchLiveVersion(prefix, platform) {
  const url = `${FEED_BASE_URL}/${prefix}-${platform}.yml`;
  const controller = new AbortController();
  // Keep the abort signal armed across both the headers fetch and the body
  // read — a CDN that returns 200 then stalls the body would otherwise hang
  // until the job-level 15min timeout instead of failing closed at 15s.
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: { "cache-control": "no-cache" },
      });
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      throw new Error(`failed to fetch ${url}: ${cause}`);
    }

    if (response.status === 404) {
      return { url, status: 404, version: null };
    }
    if (!response.ok) {
      throw new Error(`unexpected HTTP ${response.status} from ${url}`);
    }
    let body;
    try {
      body = await response.text();
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      throw new Error(`failed to read body from ${url}: ${cause}`);
    }
    let parsed;
    try {
      parsed = load(body);
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      throw new Error(`failed to parse YAML from ${url}: ${cause}`);
    }
    const version = extractVersion(parsed, `live ${prefix}-${platform}.yml`);
    return { url, status: response.status, version };
  } finally {
    clearTimeout(timer);
  }
}

async function readLocalVersion(releaseDir, prefix, platform) {
  const filePath = path.join(releaseDir, `${prefix}-${platform}.yml`);
  let body;
  try {
    body = await readFile(filePath, "utf8");
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to read local artifact ${filePath}: ${cause}`);
  }
  let parsed;
  try {
    parsed = load(body);
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to parse YAML from ${filePath}: ${cause}`);
  }
  return { filePath, version: extractVersion(parsed, `local ${prefix}-${platform}.yml`) };
}

async function main() {
  const prefix = process.env.UPDATE_METADATA_PREFIX;
  // A typo like "latset" would otherwise make every live URL 404, which the
  // gate treats as "first release in channel" and silently passes — exactly
  // the regression we're trying to prevent.
  const prefixCheck = validatePrefix(prefix);
  if (!prefixCheck.ok) {
    fail(prefixCheck.error);
  }

  const releaseDir = process.env.RELEASE_DIR ?? "release";

  let locals;
  try {
    locals = await Promise.all(
      PLATFORMS.map((platform) => readLocalVersion(releaseDir, prefix, platform))
    );
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const newVersion = locals[0].version;
  const mismatches = locals.filter((entry) => entry.version !== newVersion);
  if (mismatches.length > 0) {
    const summary = locals
      .map((entry, idx) => `${PLATFORMS[idx]}=${entry.version} (${entry.filePath})`)
      .join(" ");
    fail(
      `platform artifacts disagree on the new version: ${summary} — ` +
        `something went wrong in the matrix build.`
    );
  }

  // Fetch every channel feed in parallel so a transient mac error and a real
  // linux regression both surface in the same `::error::` annotation block,
  // rather than fail-fast hiding the second issue until the first is rerun.
  const fetchResults = await Promise.allSettled(
    PLATFORMS.map((platform) => fetchLiveVersion(prefix, platform))
  );

  const failures = [];
  for (let i = 0; i < PLATFORMS.length; i++) {
    const platform = PLATFORMS[i];
    const settled = fetchResults[i];
    if (settled.status === "rejected") {
      const reason = settled.reason;
      failures.push(`${platform}: ${reason instanceof Error ? reason.message : String(reason)}`);
      continue;
    }
    const live = settled.value;
    if (live.version === null) {
      console.log(
        `[monotonic] ${platform}: no live ${prefix}-${platform}.yml (HTTP 404) — first release in channel, allowing.`
      );
      continue;
    }
    const result = checkVersionMonotonic(live.version, newVersion);
    if (!result.ok) {
      failures.push(`${platform}: ${result.error} (feed: ${live.url})`);
    } else {
      console.log(
        `[monotonic] ${platform}: ${newVersion} > ${live.version} (live ${live.url}) — OK.`
      );
    }
  }

  if (failures.length > 0) {
    fail(`version-monotonic gate failed:\n  - ${failures.join("\n  - ")}`);
  }

  console.log(
    `[monotonic] gate passed for channel '${prefix}': new version ${newVersion} is greater than every live feed.`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

// Re-export for tests that want the shared constants without hardcoding values.
export { FEED_BASE_URL, PLATFORMS, ALLOWED_PREFIXES };
