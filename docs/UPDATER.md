# App updater (GitHub Releases)

Channel: one `latest.json` on **GitHub Releases**. CDN may mirror the same files later. Cursor Origin is source hosting only — not the binary feed.

## Keys

Public key is in `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.

Private key (do **not** commit):

```text
/home/webdev/agent-tools/p11/updater-keys/web-builder.key
```

Sign builds with:

```bash
export TAURI_SIGNING_PRIVATE_KEY_PATH=/home/webdev/agent-tools/p11/updater-keys/web-builder.key
# optional if the key has a password:
# export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=…
bun run tauri build
```

## Endpoint

Replace `OWNER/REPO` in `src-tauri/tauri.conf.json` → `plugins.updater.endpoints` with the public GitHub repository that publishes releases.

Expected URL:

```text
https://github.com/OWNER/REPO/releases/latest/download/latest.json
```

## `latest.json` shape

Attach this next to the signed updater artifacts on each release:

```json
{
  "version": "0.1.1",
  "notes": "Bug fixes",
  "pub_date": "2026-11-11T00:00:00Z",
  "platforms": {
    "linux-x86_64": {
      "signature": "<contents of .AppImage.sig>",
      "url": "https://github.com/OWNER/REPO/releases/download/v0.1.1/Web.Builder_0.1.1_amd64.AppImage"
    },
    "windows-x86_64": {
      "signature": "<contents of .nsis.zip.sig or .msi.sig>",
      "url": "https://github.com/OWNER/REPO/releases/download/v0.1.1/Web.Builder_0.1.1_x64-setup.exe"
    },
    "darwin-aarch64": {
      "signature": "<contents of .app.tar.gz.sig>",
      "url": "https://github.com/OWNER/REPO/releases/download/v0.1.1/Web.Builder_aarch64.app.tar.gz"
    },
    "darwin-x86_64": {
      "signature": "<contents of .app.tar.gz.sig>",
      "url": "https://github.com/OWNER/REPO/releases/download/v0.1.1/Web.Builder_x64.app.tar.gz"
    }
  }
}
```

Exact artifact names come from `tauri build` (`createUpdaterArtifacts: true`).

## In-app UI

**About → Check for updates** calls `check()`, then download + install + relaunch when the user confirms.

## Templates

`export-templates/vite-react` is embedded in the binary. Updating the app updates the template set used for new exports and the Vite sidecar. Site folders already on disk keep their copies; user overrides stay in `.wb-overrides.json`. Remote/CDN-only template pulls are not used.
