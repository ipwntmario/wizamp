#!/usr/bin/env node
// scripts/build-track-data.mjs
//
// Append-only generator for per-track clipData.json & sectionData.json,
// WAV -> OGG conversion, and heuristic wiring for sections/clips.
//
// Heuristics (append-only; never overwrite existing):
// - Sections created per unique prefix before first "_".
// - Section "Intro": if type missing -> type="auto".
// - If "Main" exists and Intro.nextSection missing -> Intro.nextSection="Main".
// - Sections named "End" or starting with "End": if type missing -> type="end".
// - Within a section, if clips look sequential (alpha a,b,c... or numeric 1,2,3...),
//   and a given clip's nextClip is missing, set it to the next; last loops to first.
//
// Requires: ffmpeg/ffprobe on PATH, Node 16+ (ESM)

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pExecFile = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root containing per-track folders: /public/tracks/<TrackName>/
const TRACKS_ROOT = path.resolve(__dirname, "..", "public", "tracks");

// ---------------------------- helpers --------------------------------

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function readJSON(p, fallback) {
  try {
    const txt = await fs.readFile(p, "utf8");
    const j = JSON.parse(txt);
    return j;
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    console.warn(`⚠️  Could not parse ${p}; using fallback shape.`);
    return fallback;
  }
}

async function writeJSON(p, obj) {
  const txt = JSON.stringify(obj, null, 2) + "\n";
  await fs.writeFile(p, txt, "utf8");
}

function listFilesSync(dir) {
  try { return fssync.readdirSync(dir, { withFileTypes: true }); }
  catch { return []; }
}

async function ffprobeDurationSeconds(filePath) {
  const { stdout } = await pExecFile("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath
  ], { windowsHide: true });
  const n = Number(String(stdout).trim());
  return Number.isFinite(n) ? n : 0;
}

async function convertWavToOgg(wavPath, oggPath) {
  if (fssync.existsSync(oggPath)) return false;
  await pExecFile("ffmpeg", [
    "-y",
    "-i", wavPath,
    "-c:a", "libopus",
    "-b:a", "160k",
    oggPath
  ], { windowsHide: true });
  return true;
}

function prefixBeforeUnderscore(nameNoExt) {
  const idx = nameNoExt.indexOf("_");
  return idx === -1 ? nameNoExt : nameNoExt.slice(0, idx);
}

// Determine suffix kind/index for sequencing
// Returns { kind: "alpha"|"num"|"none", index: number }
function parseSuffixIndex(nameNoExt) {
  const idx = nameNoExt.indexOf("_");
  if (idx === -1) return { kind: "none", index: Number.NaN };
  const suffix = nameNoExt.slice(idx + 1);

  // numeric?
  if (/^\d+$/.test(suffix)) return { kind: "num", index: parseInt(suffix, 10) };

  // alpha? take only first char for ordering (a,b,c,...) case-insensitive
  const m = suffix.match(/^[A-Za-z]/);
  if (m) {
    const ch = m[0].toLowerCase();
    const code = ch.charCodeAt(0);
    if (code >= 97 && code <= 122) return { kind: "alpha", index: code - 96 }; // a=1
  }

  return { kind: "none", index: Number.NaN };
}

function chooseFirstClipForSection(sectionName, clipNamesInSection) {
  const preferred = `${sectionName}_a`;
  if (clipNamesInSection.includes(preferred)) return preferred;
  if (clipNamesInSection.length === 1) return clipNamesInSection[0];

  // Try numeric "1" as a second preference
  const numericPreferred = `${sectionName}_1`;
  if (clipNamesInSection.includes(numericPreferred)) return numericPreferred;

  // Else lexicographically first for determinism
  return [...clipNamesInSection].sort((a, b) => a.localeCompare(b))[0];
}

function orderSequentialClips(clipNames) {
  // Returns { ordered: string[], isSequential: boolean }
  // We try to sort by suffix (alpha or numeric). If we can't detect a consistent kind, we bail.
  const parsed = clipNames.map(name => ({ name, ...parseSuffixIndex(name) }));
  const kinds = new Set(parsed.map(p => p.kind));
  if (kinds.size !== 1 || kinds.has("none")) {
    // no consistent alpha/num pattern
    return { ordered: [...clipNames].sort(), isSequential: false };
  }
  const kind = parsed[0].kind; // "alpha" or "num"
  parsed.sort((a, b) => a.index - b.index);
  // sanity: ensure indices are strictly increasing
  let ok = true;
  for (let i = 1; i < parsed.length; i++) {
    if (!(parsed[i].index > parsed[i - 1].index)) { ok = false; break; }
  }
  return { ordered: parsed.map(p => p.name), isSequential: ok && parsed.length > 1 };
}

// ------------------------- per-track logic ---------------------------

async function processTrack(trackDir) {
  const trackName = path.basename(trackDir);
  const audioDir = path.join(trackDir, "audio");
  await ensureDir(audioDir);

  const clipDataPath = path.join(trackDir, "clipData.json");
  const sectionDataPath = path.join(trackDir, "sectionData.json");

  // Load existing JSON (append-only policy)
  const clipJSON = await readJSON(clipDataPath, { clips: {} });
  const sectionJSON = await readJSON(sectionDataPath, { sections: {} });
  const clips = clipJSON.clips && typeof clipJSON.clips === "object" ? clipJSON.clips : (clipJSON.clips = {});
  const sections = sectionJSON.sections && typeof sectionJSON.sections === "object" ? sectionJSON.sections : (sectionJSON.sections = {});

  // Scan audio dir for WAVs (skip helper files starting with "_")
  const entries = listFilesSync(audioDir);
  const wavs = entries
    .filter(d => d.isFile() && d.name.toLowerCase().endsWith(".wav") && !d.name.startsWith("_"))
    .map(d => d.name);

  const addedClips = [];
  const convertedOnly = [];
  const skipped = [];

  // Build a map: sectionName -> [clipName]
  const sectionToClips = new Map();

  for (const wavName of wavs) {
    const base = wavName.slice(0, -4); // strip .wav
    const wavPath = path.join(audioDir, wavName);
    const oggName = `${base}.ogg`;
    const oggPath = path.join(audioDir, oggName);

    const helperWav = path.join(audioDir, `_${base}.wav`);
    const hasHelper = fssync.existsSync(helperWav);

    const existsInJSON = Object.prototype.hasOwnProperty.call(clips, base);
    const oggExists = fssync.existsSync(oggPath);

    // Ensure OGG exists
    if (!oggExists) {
      await convertWavToOgg(wavPath, oggPath);
      if (existsInJSON) convertedOnly.push(base);
    }

    if (existsInJSON && oggExists) {
      skipped.push(base);
    }

    if (!existsInJSON) {
      // New clip: probe durations and add (append-only)
      const clipEndSec = await ffprobeDurationSeconds(wavPath);
      const loopPointSec = hasHelper ? await ffprobeDurationSeconds(helperWav) : clipEndSec;

      clips[base] = {
        file: oggName,
        loopPoint: loopPointSec,
        clipEnd: clipEndSec
        // leave nextClip for wiring below (only if missing)
      };
      addedClips.push(base);
    }

    // Register this clip under its section prefix
    const sectionName = prefixBeforeUnderscore(base);
    const arr = sectionToClips.get(sectionName) || [];
    arr.push(base);
    sectionToClips.set(sectionName, arr);
  }

  // Append-only section creation + heuristics
  const hasMain = sectionToClips.has("Main");

  for (const [sectionName, clipNames] of sectionToClips.entries()) {
    // Ensure section exists
    if (!Object.prototype.hasOwnProperty.call(sections, sectionName)) {
      sections[sectionName] = {
        defaultDisplayName: sectionName,
        firstClip: chooseFirstClipForSection(sectionName, clipNames),
        type: "" // default blank; may be set by heuristics below
      };
    } else {
      const s = sections[sectionName];
      if (!s.firstClip) s.firstClip = chooseFirstClipForSection(sectionName, clipNames);
      if (!s.defaultDisplayName) s.defaultDisplayName = sectionName;
    }

    // Heuristic: Intro type/nextSection (only if missing)
    if (sectionName === "Intro") {
      if (!sections[sectionName].type) {
        sections[sectionName].type = "auto";
      }
      if (hasMain && (sections[sectionName].nextSection == null || sections[sectionName].nextSection === "")) {
        sections[sectionName].nextSection = "Main";
      }
    }

    // Heuristic: End type (only if missing)
    if (sectionName === "End" || sectionName.startsWith("End")) {
      if (!sections[sectionName].type) {
        sections[sectionName].type = "end";
      }
      // do not set/overwrite nextSection
    }

    // Wire sequential nextClip defaults inside this section (append-only)
    const { ordered, isSequential } = orderSequentialClips(clipNames);
    if (isSequential) {
      for (let i = 0; i < ordered.length; i++) {
        const name = ordered[i];
        const nextName = ordered[(i + 1) % ordered.length]; // last loops to first
        if (!clips[name]) continue;
        // only set nextClip if missing
        if (clips[name].nextClip == null) {
          clips[name].nextClip = [nextName];
        }
      }
    }
  }

  // Write back (append-only changes)
  await writeJSON(clipDataPath, { clips });
  await writeJSON(sectionDataPath, { sections });

  return { trackName, addedClips, convertedOnly, skipped };
}

// ------------------------------ entry --------------------------------

async function main() {
  console.log(`Scanning tracks at: ${TRACKS_ROOT}`);
  const children = listFilesSync(TRACKS_ROOT).filter(d => d.isDirectory());

  if (!children.length) {
    console.log("No tracks found.");
    return;
  }

  const results = [];
  for (const d of children) {
    const trackDir = path.join(TRACKS_ROOT, d.name);
    const r = await processTrack(trackDir);
    results.push(r);
  }

  console.log("\nSummary:");
  for (const r of results) {
    console.log(`• ${r.trackName}`);
    console.log(`  added:         ${r.addedClips.length ? r.addedClips.join(", ") : "(none)"}`);
    console.log(`  convertedOnly: ${r.convertedOnly.length ? r.convertedOnly.join(", ") : "(none)"}`);
    console.log(`  skipped:       ${r.skipped.length ? r.skipped.join(", ") : "(none)"}\n`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
