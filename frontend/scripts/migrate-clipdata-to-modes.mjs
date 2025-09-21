#!/usr/bin/env node
// scripts/migrate-clipdata-to-modes.mjs
//
// Purpose: For each track at public/tracks/<TrackName>/clipData.json,
// convert any clip entry with `file: "<string>"` into
// `file: { "base": "<string>" }`.
// - Append-only: keeps all other keys intact
// - Skips entries already in the object form
// - Creates a .bak backup before writing
//
// Usage: node scripts/migrate-clipdata-to-modes.mjs

import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root where your per-track folders live:
const TRACKS_ROOT = path.resolve(__dirname, "..", "public", "tracks");

async function readJSON(file, fallback) {
  try {
    const txt = await fs.readFile(file, "utf8");
    return JSON.parse(txt);
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    console.warn(`⚠️  Could not parse JSON: ${file}\n${e}`);
    return fallback;
  }
}

function listDirs(root) {
  try {
    return fssync
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

async function backupFile(filePath) {
  try {
    const bak = filePath + ".bak";
    if (!fssync.existsSync(filePath)) return;
    // Don’t overwrite an existing backup; create timestamped if necessary
    const target =
      fssync.existsSync(bak) ? filePath + "." + Date.now() + ".bak" : bak;
    await fs.copyFile(filePath, target);
    return target;
  } catch (e) {
    console.warn(`⚠️  Could not create backup for ${filePath}: ${e.message}`);
  }
}

async function migrateClipData(trackDir) {
  const clipDataPath = path.join(trackDir, "clipData.json");
  const json = await readJSON(clipDataPath, null);
  if (!json || typeof json !== "object") return { migrated: 0, skipped: true };

  const clips = json.clips && typeof json.clips === "object" ? json.clips : null;
  if (!clips) return { migrated: 0, skipped: true };

  let changed = 0;

  for (const [clipName, clipObj] of Object.entries(clips)) {
    if (!clipObj || typeof clipObj !== "object") continue;
    const fileField = clipObj.file;

    // Already in { base: ... } form? Leave as-is.
    if (fileField && typeof fileField === "object") continue;

    // If it's a string, convert to object with base
    if (typeof fileField === "string") {
      clipObj.file = { base: fileField };
      changed++;
    }
  }

  if (changed > 0) {
    await backupFile(clipDataPath);
    const pretty = JSON.stringify({ clips }, null, 2) + "\n";
    await fs.writeFile(clipDataPath, pretty, "utf8");
  }

  return { migrated: changed, skipped: false };
}

async function main() {
  const tracks = listDirs(TRACKS_ROOT);
  if (!tracks.length) {
    console.log(`No track folders found in ${TRACKS_ROOT}`);
    return;
  }

  console.log(`Migrating clipData.json files under ${TRACKS_ROOT} …\n`);
  let total = 0;

  for (const name of tracks) {
    const dir = path.join(TRACKS_ROOT, name);
    const res = await migrateClipData(dir);
    if (res.skipped) {
      console.log(`• ${name}: (no changes)`);
    } else {
      console.log(`• ${name}: migrated ${res.migrated} entr${res.migrated === 1 ? "y" : "ies"}`);
      total += res.migrated;
    }
  }

  console.log(`\nDone. Total entries migrated: ${total}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
