# Microsoft Store distribution

## Overview

Daintree's Windows distribution channel is the Microsoft Store. The `.github/workflows/release.yml` workflow builds a `.appx` package for Windows on tag push, archives it to Cloudflare R2 alongside the macOS / Linux binaries, and submits it to Microsoft Store certification via the [`msstore`](https://github.com/microsoft/msstore-cli) CLI.

Microsoft re-signs the package after certification with a Microsoft-issued certificate, so no Authenticode certificate is needed. End-user updates are delivered through the Store, not electron-updater. Mac and Linux distribution paths are unchanged.

The release pipeline degrades gracefully when the Store secrets are not yet configured: the `.appx` is still built and archived to R2, the submission step is skipped with a `::notice::` line, and the rest of the release proceeds. This lets the engineering land before the Partner Center account finishes verification.

## One-time Partner Center setup

Manual setup is unavoidable — Microsoft does not allow programmatic creation of new app listings. The first submission must happen by hand before the API can drive subsequent updates.

1. **Sign up** at [storedeveloper.microsoft.com](https://storedeveloper.microsoft.com) as an individual (free for individual and company accounts as of 2026). Identity verification is selfie + government-issued ID.
2. **Reserve the app name** "Daintree" in Partner Center.
3. **Note the assigned Identity Name and Publisher** (Publisher is a `CN=…GUID` string). These get pasted into `electron-builder.config.cjs` as `appx.identityName` and `appx.publisher`.
4. **Complete the IARC age-rating questionnaire**, privacy policy URL, screenshots, and store listing copy. Submission notes should disclose that the app executes user-initiated commands via an integrated terminal and that AI-agent recipes can drive shell commands with explicit user confirmation (see [Listing copy](#listing-copy) below).
5. **Submit one initial placeholder MSIX** by hand. Wait for it to certify — this moves the app out of "Draft" state and unlocks the submission API.
6. **Fill out the W-8BEN tax form** in Partner Center (US-Australia tax treaty). Required even for free apps if there's any chance of monetization later. AU developers can also add an ABN under Payout and tax profile for cleaner GST handling.

## Microsoft Entra app registration (for automation)

The msstore CLI authenticates against Partner Center using a Microsoft Entra (Azure AD) service principal — not personal credentials.

1. In the Microsoft Entra admin center, **register a new application** (single-tenant is fine).
2. **Generate a client secret** under Certificates & secrets. Copy the value immediately — it is only shown once.
3. In Partner Center, **assign the Entra application** the Manager or Developer role under Account settings → User management.
4. Copy the four values you'll need:
   - **Tenant ID** (Microsoft Entra Overview)
   - **Client ID** (the registered app's Application ID)
   - **Client secret** (the value from step 2)
   - **Seller ID** (Partner Center → Account settings → identifiers)
5. Note the **Store Product ID** for Daintree (Partner Center → Daintree → Product Identity). This identifies the app the submission targets.

## GitHub secrets

Add the following to the GitHub repository under Settings → Secrets and variables → Actions. Until all five exist, the release workflow builds the `.appx` and archives it to R2 but skips Store submission.

| Secret | Description |
| --- | --- |
| `PARTNER_CENTER_TENANT_ID` | Microsoft Entra tenant ID of the directory that owns the Entra app registration |
| `PARTNER_CENTER_SELLER_ID` | Partner Center Seller ID (Account settings → Identifiers) |
| `PARTNER_CENTER_CLIENT_ID` | Application (client) ID of the Entra app registration |
| `PARTNER_CENTER_CLIENT_SECRET` | Client secret value from the Entra app registration |
| `STORE_PRODUCT_ID` | Partner Center Product ID for Daintree |

The existing R2 secrets (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET`) are still used to archive the `.appx` artifact alongside macOS / Linux binaries.

## Release flow

On a `v*` tag push:

1. The workflow builds Daintree on macos-14 / ubuntu-22.04 / windows-latest.
2. The Windows runner produces a `.appx` via `electron-builder --win appx`.
3. WACK runs against the `.appx` as a best-effort smoke test (does not fail the build — Microsoft re-runs WACK during certification).
4. The `.appx` is uploaded as a workflow artifact and synced to R2 alongside `*.dmg`, `*.zip`, `*.AppImage`, `*.deb`.
5. **If all five PARTNER*CENTER*\*/STORE_PRODUCT_ID secrets are present**: the workflow runs `msstore reconfigure` then `msstore submission update <productId> <appxPath>` and `msstore submission publish <productId>`. Store certification typically takes 2–24 hours.
6. **If any of the five secrets is missing**: the submission step is skipped with a `::notice::` log line and the release otherwise completes normally. R2 sync still happens.

This means the migration code can be merged before the Partner Center account is verified — releases continue to function, the `.appx` artifact lives on R2, and Store submission auto-engages the moment the secrets are added.

## Local packaging

To produce a `.appx` locally (e.g. for the initial manual Partner Center submission):

```bash
npm run build && npx electron-builder --win appx --publish never
```

The output lands in `release/`. To upload it manually to Partner Center:

1. Sign into Partner Center.
2. Navigate to Daintree → Submissions → New submission → Packages.
3. Drag the `.appx` into the package upload area. The first submission requires a real package, not a placeholder — but a development build with a placeholder description is fine for the gate-clearing submission.

## electron-builder appx config

The `appx` block in `electron-builder.config.cjs` carries identity values that must match Partner Center exactly:

```js
appx: {
  identityName: "<from Partner Center Product Identity>",
  publisher: "CN=<from Partner Center Product Identity>",
  publisherDisplayName: "Greg Priday",
  applicationId: "Daintree",
  displayName: "Daintree",
  languages: ["en-US"],
}
```

A mismatch between `identityName` / `publisher` and the Partner Center values fails `msstore submission update` with `Invalid Identity` / `package publisher must match the developer account's publisher identity`. Update the config in lockstep if Partner Center ever reissues the identity.

`electron-builder` automatically declares the `runFullTrust` restricted capability and defaults the entry point to `Windows.FullTrustApplication`, which is correct for Daintree (full-trust Win32 desktop app spawning shell processes via node-pty). No extra capability declarations are needed for the integrated terminal.

## Listing copy

Recommended submission notes / listing description, calibrated to the Microsoft Store developer-tools carve-out and the late-2025 generative-AI policy:

> Daintree is an Electron-based IDE for orchestrating AI coding agents. It includes an integrated terminal powered by xterm.js plus node-pty that runs the user's local shell (cmd.exe, PowerShell, pwsh) for user-initiated commands. Daintree includes optional AI-coding-agent recipes that can drive shell commands; agent execution is opt-in, scoped to the current worktree, and surfaces every command before running. The app does not execute shell commands in the background without explicit user action.

This framing is the difference between a clean review and a back-and-forth on the "apps that ship interpreters or shells" and "live generative AI technologies" policies.

## Troubleshooting

**`Invalid Identity` / `package publisher must match` on `msstore submission update`** — the `appx.identityName` or `appx.publisher` in `electron-builder.config.cjs` does not match Partner Center's Product Identity. Copy them verbatim from Partner Center → Daintree → Product Management → Product Identity.

**WACK fails on the hosted runner** — the WACK step is best-effort and uses `|| $true` to swallow failures. If WACK is consistently broken on `windows-latest`, drop the step. Microsoft re-runs WACK during certification, so the local check is convenience rather than load-bearing.

**ASAR integrity check fails after Store re-sign** — the Store re-signs the outer MSIX without modifying `app.asar`, so `enableEmbeddedAsarIntegrityValidation=true` should continue to work. If the first end-to-end Store-certified build fails the integrity check at runtime, set the fuse to `false` only for the Windows-Store build (electron-builder allows per-platform fuse overrides via the `electronFuses` config block).

**Certification rejection on policy 10.x (developer tools)** — usually means the listing description didn't disclose user-initiated command execution clearly enough. Reuse the [Listing copy](#listing-copy) boilerplate verbatim.

**`msstore` CLI subcommand grammar drift** — the CLI is in preview as of 2026 and command names have moved between releases. If the workflow's `msstore submission update / publish` calls fail with "unknown command," run `msstore --help` on the runner output to see the current grammar and update the workflow.

## References

- [Open a developer account](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account)
- [Create an app submission for your MSIX app](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/create-app-submission)
- [Microsoft Store Developer CLI](https://github.com/microsoft/msstore-cli) and its [GitHub Actions integration](https://learn.microsoft.com/en-us/windows/apps/publish/msstore-dev-cli/github-actions)
- [Windows App Certification Kit](https://learn.microsoft.com/en-us/windows/uwp/debug-test-perf/windows-app-certification-kit)
- [Microsoft Store Policies](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies)
- Internal: [`docs/release.md`](../release.md) (macOS signing, R2 publishing, the rest of the release pipeline)
