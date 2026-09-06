// All playback paths use the same ordering and consume RNG only for a real choice.
export function chooseNextClip(nextClip, random) {
  const choices = Array.isArray(nextClip) ? nextClip : nextClip ? [nextClip] : [];
  if (choices.length < 2) return choices[0] ?? null;
  return [...choices].sort()[Math.floor(random() * choices.length)];
}
