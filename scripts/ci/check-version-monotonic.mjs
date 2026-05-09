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
const PLATFORMS = ["mac", "linux"];

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
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { "cache-control": "no-cache" },
    });
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to fetch ${url}: ${cause}`);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404) {
    return { url, status: 404, version: null };
  }
  if (!response.ok) {
    throw new Error(`unexpected HTTP ${response.status} from ${url}`);
  }
  const body = await response.text();
  let parsed;
  try {
    parsed = load(body);
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to parse YAML from ${url}: ${cause}`);
  }
  const version = extractVersion(parsed, `live ${prefix}-${platform}.yml`);
  return { url, status: response.status, version };
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
  if (!prefix) {
    fail(
      "UPDATE_METADATA_PREFIX env var is not set — refusing to guess the channel. " +
        "Set it to one of: latest, rc, beta."
    );
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

  const [macLocal, linuxLocal] = locals;
  if (macLocal.version !== linuxLocal.version) {
    fail(
      `mac and linux artifacts disagree on the new version: ` +
        `mac=${macLocal.version} (${macLocal.filePath}) ` +
        `linux=${linuxLocal.version} (${linuxLocal.filePath}) — ` +
        `something went wrong in the matrix build.`
    );
  }
  const newVersion = macLocal.version;

  let lives;
  try {
    lives = await Promise.all(PLATFORMS.map((platform) => fetchLiveVersion(prefix, platform)));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const failures = [];
  for (let i = 0; i < PLATFORMS.length; i++) {
    const platform = PLATFORMS[i];
    const live = lives[i];
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

// Re-export for tests that want the shared constant without hardcoding the URL.
export { FEED_BASE_URL, PLATFORMS };
