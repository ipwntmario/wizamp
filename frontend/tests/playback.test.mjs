import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../src/audio/audioEngine.js';
import { orderTracks } from '../src/data/trackOrdering.js';

function fixture() {
  const engine = new AudioEngine();
  const parameter = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} });
  engine.audioCtx = {
    state: 'running', currentTime: 1,
    createGain: () => ({ gain: parameter(), connect() {} }),
    createBufferSource: () => ({ connect() {}, start() {}, stop() {}, disconnect() {} }),
  };
  engine.masterGain = engine.audioCtx.createGain();
  engine.warmBus = engine.audioCtx.createGain();
  engine.setData({
    clips: {
      A: { nextClip: ['B'], loopPoint: 10, clipEnd: 11 },
      B: { nextClip: ['D', 'C'], loopPoint: 10, clipEnd: 11 },
      C: { nextClip: ['A'], loopPoint: 10, clipEnd: 11 },
      D: { nextClip: ['A'], loopPoint: 10, clipEnd: 11 },
    },
    sections: { Main: { firstClip: 'A', modes: ['intense'] }, Next: { firstClip: 'D' } },
    tracks: {},
  });
  for (const name of Object.keys(engine.clipData)) engine.activeClips[name] = { buffersByMode: { base: { duration: 11 }, intense: { duration: 11 } } };
  engine.setCurrentSection('Main');
  engine.setRandomSeed(42);
  return engine;
}

function withTimers(fn) {
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  const timers = new Map();
  let serial = 0;
  globalThis.setTimeout = (callback, ms) => { const id = ++serial; timers.set(id, { callback, ms }); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  try { return fn(timers); } finally { globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; }
}

test('normal and scheduled playback consume identical RNG draws at boundaries', () => withTimers(timers => {
  const normal = fixture();
  normal.playClip('A');
  const normalBoundary = [...timers.values()].find(timer => timer.ms === 10000);
  normalBoundary.callback();
  assert.equal(normal.lastPlayingClipName, 'B');
  assert.equal(normal.getRngDrawCount(), 0);
  normal._handleLoopPointForClip('B');
  const expected = normal.lastPlayingClipName;
  assert.equal(normal.getRngDrawCount(), 1);
  timers.clear();
  const scheduled = fixture();
  scheduled._playClipAtAudioTime('A', { startAtAudioTime: 1 });
  timers.get(scheduled.activeClips.A.timerId).callback();
  assert.equal(scheduled.lastPlayingClipName, 'B');
  assert.equal(scheduled.getRngDrawCount(), 0);
  scheduled._handleLoopPointForClip('B');
  assert.equal(scheduled.lastPlayingClipName, expected);
  assert.equal(scheduled.getRngDrawCount(), 1);
}));

test('section changes preserve compatible modes and clear both UI queues', () => withTimers(() => {
  const engine = fixture();
  const queues = [];
  engine.onQueueChange = value => queues.push(['section', value]);
  engine.onModeQueueChange = value => queues.push(['mode', value]);
  engine.setCurrentMode('intense');
  engine.queueSectionTransition('Next');
  engine.queueModeTransition('intense');
  engine._handleLoopPointForClip('A');
  assert.equal(engine.currentSectionName, 'Next');
  assert.equal(engine.currentModeName, 'base');
  assert.equal(engine.lastPlayingClipName, 'D');
  assert.deepEqual(queues.slice(-2), [['section', null], ['mode', null]]);
}));

test('stop cancels scheduled-position transitions', () => withTimers(timers => {
  const engine = fixture();
  engine._playClipAtAudioTime('A', { startAtAudioTime: 2 });
  const boundaryId = engine.activeClips.A.timerId;
  engine.stopTrack(false);
  assert.equal(timers.has(boundaryId), false);
  assert.equal(engine.isPlaying, false);
}));

test('changing tracks releases the previous decoded buffer cache', async () => {
  const engine = fixture();
  engine.currentTrackName = 'Old';
  engine._bufferCache.set('old.ogg', {});
  engine.setData({ clips: {}, sections: {}, tracks: {} });
  await engine.preloadTrack('New');
  assert.equal(engine.currentTrackName, 'New');
  assert.equal(engine._bufferCache.size, 0);
});

test('catalog ordering keeps pinned tests and honors renamed titles', () => {
  const tracks = { A: { simple: true }, B: { simple: false }, C: { simple: false, test: true }, D: { test: true } };
  assert.deepEqual(orderTracks(tracks, { pinned: new Set(['C']), hideTests: true, dynamicFirst: true, sortMode: 'alpha-asc' }), ['C', 'B', 'A']);
  assert.deepEqual(orderTracks({ A: {}, B: {} }, { names: { tracks: { A: { displayName: 'Z' } } }, sortMode: 'alpha-asc' }), ['B', 'A']);
});
