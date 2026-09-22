// Count the audible path through a deterministic ending section. A branching or
// looping path has no reliable duration until the engine chooses its next clip.
export function remainingEndPathSeconds(clips, firstClipName, firstOffsetSeconds = 0) {
  if (!firstClipName) return null;
  let clipName = firstClipName;
  let offset = firstOffsetSeconds;
  let total = 0;
  const visited = new Set();

  while (clipName && !visited.has(clipName)) {
    visited.add(clipName);
    const clip = clips?.[clipName];
    if (!clip) return null;
    const next = Array.isArray(clip.nextClip) ? clip.nextClip : (clip.nextClip ? [clip.nextClip] : []);
    if (next.length > 1) return null;
    const end = next.length ? clip.loopPoint : (clip.clipEnd ?? clip.loopPoint);
    if (!Number.isFinite(end)) return null;
    total += Math.max(0, end - offset);
    clipName = next[0] ?? null;
    offset = clipName ? (clips[clipName]?.loopStart ?? 0) : 0;
  }

  return clipName ? null : total;
}

export function replacementRemainingSeconds({ clips, sections, currentSectionName, queuedSectionName, timing }) {
  if (!timing) return null;
  if (timing.kind === "fade") return timing.remainingSeconds;
  if (timing.kind !== "clip") return null;

  if (sections?.[currentSectionName]?.type === "end") {
    return remainingEndPathSeconds(clips, timing.clipName, timing.positionSeconds);
  }
  const endSection = sections?.[queuedSectionName];
  if (endSection?.type !== "end") return null;
  const endDuration = remainingEndPathSeconds(clips, endSection.firstClip);
  return endDuration == null ? null : timing.toBoundarySeconds + endDuration;
}
