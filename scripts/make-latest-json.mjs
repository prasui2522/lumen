#!/usr/bin/env bun
/**
 * Build a Tauri updater `latest.json` from signed artifacts in a folder.
 *
 * Usage:
 *   bun scripts/make-latest-json.mjs \
 *     --dir path/to/bundle \
 *     --version 0.1.1 \
 *     --repo OWNER/REPO \
 *     --out latest.json \
 *     [--notes "Bug fixes"] \
 *     [--tag v0.1.1]
 *
 * Looks for common Tauri updater artifact pairs (file + .sig) and maps them
 * to linux-x86_64 / windows-x86_64 / darwin-aarch64 / darwin-x86_64.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const dir = arg("dir");
const version = arg("version");
const repo = arg("repo");
const out = arg("out", "latest.json");
const notes = arg("notes", "");
const tag = arg("tag", version ? `v${version}` : undefined);

if (!dir || !version || !repo || !tag) {
  console.error(
    "Usage: bun scripts/make-latest-json.mjs --dir DIR --version X.Y.Z --repo OWNER/REPO [--tag vX.Y.Z] [--notes TEXT] [--out latest.json]",
  );
  process.exit(1);
}

const files = readdirSync(dir);
const sigOf = (name) => {
  const sigName = files.find((f) => f === `${name}.sig`);
  return sigName ? readFileSync(join(dir, sigName), "utf8").trim() : null;
};

/** Prefer the first matching basename pattern. */
function pick(patterns) {
  for (const re of patterns) {
    const name = files.find((f) => re.test(f) && !f.endsWith(".sig"));
    if (!name) continue;
    const signature = sigOf(name);
    if (!signature) {
      console.warn(`skip ${name}: missing .sig`);
      continue;
    }
    return { name, signature };
  }
  return null;
}

const platforms = {};
const map = [
  [
    "linux-x86_64",
    [/\.AppImage$/i, /amd64\.AppImage$/i, /x86_64\.AppImage$/i],
  ],
  [
    "windows-x86_64",
    [/x64-setup\.exe$/i, /-setup\.exe$/i, /\.msi$/i, /\.nsis\.zip$/i],
  ],
  ["darwin-aarch64", [/aarch64\.app\.tar\.gz$/i, /aarch64.*\.tar\.gz$/i]],
  ["darwin-x86_64", [/x64\.app\.tar\.gz$/i, /x86_64\.app\.tar\.gz$/i]],
];

for (const [platform, patterns] of map) {
  const hit = pick(patterns);
  if (!hit) continue;
  platforms[platform] = {
    signature: hit.signature,
    url: `https://github.com/${repo}/releases/download/${tag}/${basename(hit.name)}`,
  };
}

if (Object.keys(platforms).length === 0) {
  console.error(`No signed updater artifacts found in ${dir}`);
  process.exit(1);
}

const body = {
  version,
  notes,
  pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  platforms,
};

writeFileSync(out, `${JSON.stringify(body, null, 2)}\n`);
console.log(`Wrote ${out} (${Object.keys(platforms).join(", ")})`);
