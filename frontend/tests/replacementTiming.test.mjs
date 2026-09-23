import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../src/audio/audioEngine.js';
import { remainingEndPathSeconds, replacementRemainingSeconds } from '../src/data/replacementTiming.js';

const clips = {
  Main: { loopPoint: 12, nextClip: ['Main'] },
  EndA: { loopPoint: 4, nextClip: ['EndB'] },
  EndB: { loopStart: 1, clipEnd: 9, nextClip: [] },
};
const sections = { Main: { type: '' }, Ending: { type: 'end', firstClip: 'EndA' } };

test('queued ending wait includes the current clip boundary and entire ending path', () => {
  assert.equal(remainingEndPathSeconds(clips, 'EndA'), 12);
  assert.equal(replacementRemainingSeconds({
    clips, sections, currentSectionName: 'Main', queuedSectionName: 'Ending',
    timing: { kind: 'clip', clipName: 'Main', positionSeconds: 5, toBoundarySeconds: 7 },
  }), 19);
  assert.equal(replacementRemainingSeconds({
    clips, sections, currentSectionName: 'Ending', queuedSectionName: null,
    timing: { kind: 'clip', clipName: 'EndB', positionSeconds: 3, toBoundarySeconds: 0 },
  }), 6);
});

test('unknown branching or looping endings do not claim a precise duration', () => {
  assert.equal(remainingEndPathSeconds({ A: { loopPoint: 4, nextClip: ['B', 'C'] } }, 'A'), null);
  assert.equal(remainingEndPathSeconds({ A: { loopPoint: 4, nextClip: ['A'] } }, 'A'), null);
});

test('engine reports live stop-fade and clip-boundary timing', () => {
  const engine = new AudioEngine();
  engine.audioCtx = { currentTime: 5 };
  engine.clipData = { Main: clips.Main };
  engine.activeClips = { Main: { buffer: { duration: 13 }, startedAt: 2, offsetAtStart: 1 } };
  engine.lastPlayingClipName = 'Main';
  assert.deepEqual(engine.getTrackExitTiming(), {
    kind: 'clip', clipName: 'Main', startedAt: 2, positionSeconds: 4, toBoundarySeconds: 8,
  });
  engine._stopPendingUntil = 10;
  engine._stopFadeDuration = 6;
  assert.deepEqual(engine.getTrackExitTiming(), { kind: 'fade', remainingSeconds: 5, totalSeconds: 6 });
  assert.equal(replacementRemainingSeconds({ timing: engine.getTrackExitTiming() }), 5);
});
