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

## Step-by-step: first public release

1. **Create a public GitHub repo** and add it as `origin` (this project has no remote yet).
2. **Store secrets** on that repo:
   - `TAURI_SIGNING_PRIVATE_KEY` — full contents of the `.key` file
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — only if the key is password-protected
3. **Push `main`**, then tag and push a version:
   ```bash
   git tag v0.1.1
   git push origin main --tags
   ```
4. **GitHub Actions** (`.github/workflows/release.yml`) will:
   - rewrite `OWNER/REPO` in `tauri.conf.json` to `github.repository`
   - build signed updater artifacts on Linux / Windows / macOS
   - assemble `latest.json` via `scripts/make-latest-json.mjs`
   - publish a GitHub Release with the binaries + `latest.json`
5. Installed apps then check:

```text
https://github.com/<your-owner>/<your-repo>/releases/latest/download/latest.json
```

Until step 1–4 finish, **About → Check for updates** hits the placeholder URL and shows a clear “OWNER/REPO not set” error.

### Local / manual `latest.json`

```bash
bun scripts/make-latest-json.mjs \
  --dir path/to/bundle \
  --version 0.1.1 \
  --repo OWNER/REPO \
  --out latest.json
```

## Endpoint (dev placeholder)

`src-tauri/tauri.conf.json` keeps the placeholder until CI rewrites it:

```text
https://github.com/OWNER/REPO/releases/latest/download/latest.json
```

## `latest.json` shape

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
