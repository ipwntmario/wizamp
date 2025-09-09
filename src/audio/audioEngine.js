// audioEngine.js
export class AudioEngine {
  constructor({
    onStatus,
    onSectionChange,
    onQueueChange,
    onModeChange,
    onModeQueueChange,
    onReady,
    onPreloadComplete
  } = {}) {
    this.onStatus = onStatus || (() => {});
    this.onSectionChange = onSectionChange || (() => {});
    this.onQueueChange = onQueueChange || (() => {});
    this.onModeChange = onModeChange || (() => {});
    this.onModeQueueChange = onModeQueueChange || (() => {});
    this.onReady = onReady || (() => {});
    this.onPreloadComplete = typeof onPreloadComplete === "function" ? onPreloadComplete : () => {};

    this.audioCtx = null;
    this.masterGain = null;

    this.fadeOutSeconds = 6;
    this.userGain = 1.0;

    // track & dataset
    this.clipData = {};
    this.sectionData = {};
    this.trackData = {};
    this.lastTrackName = null;

    // preloading / playback
    this.activeClips = {};       // { clipName: { source, gainNode, buffersByMode, startedAt, offsetAtStart } }
    this.scheduledTimeouts = []; // [timeoutId]
    this._playbackToken = 0; // increments each new playClip; stale timers check this
    this._isPreloaded = false;

    // section & mode state
    this.currentSectionName = null;
    this.queuedNextSectionName = null;

    this.currentModeName = "base";
    this.queuedNextModeName = null;

    this.lastPlayingClipName = null;
    this.currentTrackName = null;

    // cache section->availableModes (includes "base")
    this.sectionModes = new Map();
  }

  get isPlaying() {
    return !!this.lastPlayingClipName;
  }
  get isPreloaded() {
    return !!this._isPreloaded;
  }

  ensureContext() {
    if (this.audioCtx) return this.audioCtx;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.setValueAtTime(1, ctx.currentTime);
    master.connect(ctx.destination);
    this.audioCtx = ctx;
    this.masterGain = master;
    return ctx;
  }

  setUserVolume(v) {
    const ctx = this.ensureContext();
    const val = Math.max(0, Math.min(1, Number(v) || 0));
    this.userGain = val;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(val, ctx.currentTime);
    }
  }

  setTrackVolume(v) {
    // you already scale track volume at individual clip gains;
    // if you centralize it later, apply here.
    this.trackVolume = Math.max(0, Math.min(1, Number(v) || 0));
  }

  setFadeOutSeconds(n) {
    this.fadeOutSeconds = Math.max(0, Math.min(30, Number(n) || 0));
  }

  setData({ clips, sections, tracks }) {
    this.clipData = clips || {};
    this.sectionData = sections || {};
    this.trackData = tracks || {};
    // recompute modes per section (always include "base")
    this.sectionModes = new Map(
      Object.entries(this.sectionData).map(([name, s]) => {
        const extra = Array.isArray(s?.modes) ? s.modes : (s?.modes ? [s.modes] : []);
        const modes = ["base", ...extra.filter(Boolean)];
        return [name, modes];
      })
    );
  }

  clearScheduled() {
    this.scheduledTimeouts.forEach(clearTimeout);
    this.scheduledTimeouts = [];
  }

  _clearActiveClipsSilently() {
    Object.values(this.activeClips).forEach(({ source }) => {
      try { source.stop(); } catch {}
    });
    this.activeClips = {};
    this._isPreloaded = false;
  }

  setCurrentSection(name) {
    this.currentSectionName = name || null;
    this.onSectionChange?.(this.currentSectionName);
  }

  // ----- modes API -----
  getAvailableModes(sectionName) {
    return this.sectionModes.get(sectionName) || ["base"];
  }

  setCurrentMode(modeName) {
    const modes = this.getAvailableModes(this.currentSectionName);
    const chosen = modes.includes(modeName) ? modeName : "base";
    this.currentModeName = chosen;
    this.onModeChange?.(chosen);
  }

  queueModeTransition(modeNameOrNull) {
    // only queue if it exists for the *current* section
    if (modeNameOrNull) {
      const modes = this.getAvailableModes(this.currentSectionName);
      if (!modes.includes(modeNameOrNull)) return;
      this.queuedNextModeName = modeNameOrNull;
    } else {
      this.queuedNextModeName = null;
    }
    this.onModeQueueChange?.(this.queuedNextModeName);
  }

  clearQueuedMode() {
    this.queuedNextModeName = null;
    this.onModeQueueChange?.(null);
  }

  // ----- preload -----
  async preloadTrack(trackName, opts = {}) {
    const ctx = this.ensureContext();

    this.lastTrackName = trackName;
    this.currentTrackName = trackName;

    const { basePath, trackVolume } = opts || {};
    if (typeof trackVolume === "number") this.setTrackVolume(trackVolume);
    this.trackBase = basePath ? String(basePath) : this.trackBase;

    // If not playing but we had previous preloaded sources, clear them
    if (!this.isPlaying && Object.keys(this.activeClips).length > 0) {
      this._clearActiveClipsSilently();
    }
    // If playing, defer
    if (this.isPlaying) {
      this.onStatus?.("Preload deferred: still playing");
      return;
    }

    // Decode all clips + all mode files to buffers (no need to start muted loopers)
    this.activeClips = {};
    const clipEntries = Object.entries(this.clipData);

    for (const [clipName, clipObj] of clipEntries) {
      const fileMap = clipObj?.file || {};
      const modes = Object.keys(fileMap);
      if (modes.length === 0) continue;

      const buffersByMode = {};
      for (const modeKey of modes) {
        const fname = fileMap[modeKey];
        if (!fname) continue;
        const url = `${this.trackBase ? this.trackBase : ""}/audio/${fname}`.replace(/([^:])\/{2,}/g, "$1/"); // normalize
        const res = await fetch(url);
        const arr = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(arr.slice(0));
        buffersByMode[modeKey] = buf;
      }

      // store buffers; source/gainNode allocated when playing
      this.activeClips[clipName] = {
        source: null,
        gainNode: null,
        buffersByMode,
        startedAt: 0,
        offsetAtStart: 0
      };
    }

    this._isPreloaded = true;
    this.onStatus?.(`Track '${trackName}' preloaded`);
    this.onReady?.();
    console.log("[ENGINE] preloadTrack complete for", trackName,
                "currentTrackName:", this.currentTrackName);
    try {
      this.onPreloadComplete?.(this.currentTrackName || trackName);
    } catch (e) {
      console.warn("[ENGINE] onPreloadComplete handler threw:", e);
    }
    this.onPreloadComplete?.(this.currentTrackName || trackName);
  }

  // ----- stop -----
  stopTrack(withFade = true) {
    if (!this.audioCtx) return;
    this.clearScheduled();

    const fade = Math.max(0, Number(this.fadeOutSeconds ?? 0));
    const now = this.audioCtx.currentTime;

    const finish = () => {
      Object.values(this.activeClips).forEach(({ source }) => {
        try { source.stop(); } catch {}
      });
      this.activeClips = {};
      this.lastPlayingClipName = null;
      this._isPreloaded = false;
      this.onStatus?.("Stopped");
    };

    if (withFade && fade > 0) {
      Object.values(this.activeClips).forEach(({ gainNode }) => {
        if (!gainNode) return;
        try {
          gainNode.gain.cancelScheduledValues(now);
          gainNode.gain.setValueAtTime(gainNode.gain.value, now);
          gainNode.gain.linearRampToValueAtTime(0, now + fade);
        } catch {}
      });
      const id = setTimeout(finish, fade * 1000 + 60);
      this.scheduledTimeouts.push(id);
    } else {
      // instant
      Object.values(this.activeClips).forEach(({ source, gainNode }) => {
        try {
          if (gainNode) {
            gainNode.gain.cancelScheduledValues(now);
            gainNode.gain.setValueAtTime(0, now);
          }
        } catch {}
        try { source && source.stop(); } catch {}
      });
      finish();
    }
  }

  // ----- sections / modes -----
  playSection(sectionName) {
    console.log("[ENGINE] playSection", sectionName,
            "currentMode:", this.currentModeName);
    const section = this.sectionData[sectionName];
    if (!section) {
      console.error(`Section '${sectionName}' not found`);
      return;
    }

    // Determine starting mode for the target section:
    // default to base; if the section supports the *current* mode, keep it
    const available = this.getAvailableModes(sectionName);
    const keepMode = available.includes(this.currentModeName) ? this.currentModeName : "base";
    this.currentModeName = keepMode;
    this.onModeChange?.(keepMode);

    this.setCurrentSection(sectionName);
    this.playClip(section.firstClip);
  }

  queueSectionTransition(name) {
    this.queuedNextSectionName = name || null;
    this.onQueueChange?.(this.queuedNextSectionName);
  }
  clearQueuedSection() {
    this.queuedNextSectionName = null;
    this.onQueueChange?.(null);
  }

  // Helper: which section does a clip belong to? (prefix before first "_")
  _sectionOfClip(clipName) {
    const idx = clipName.indexOf("_");
    return idx === -1 ? clipName : clipName.slice(0, idx);
  }

  // ----- core playback -----
  playClip = (clipName) => {
    console.log("[ENGINE] playClip", clipName,
                "mode:", this.currentModeName, "section:", this.currentSectionName);
    const ctx = this.ensureContext();
    const clip = this.clipData[clipName];
    const entry = this.activeClips[clipName];
    if (!clip || !entry) {
      console.error(`Clip '${clipName}' not found or not loaded`);
      return;
    }

    // choose buffer by mode (fallback base)
    const sectionName = this._sectionOfClip(clipName);
    const mode = this.currentModeName || "base";
    const buffer =
      entry.buffersByMode?.[mode] ??
      entry.buffersByMode?.base;

    if (!buffer) {
      console.error(`No buffer for clip '${clipName}' in mode '${mode}' (or base)`);
      return;
    }

    // stop old instance for this clip
    if (entry.source) {
      try { entry.source.stop(); } catch {}
    }

    this._playbackToken++;
    const myToken = this._playbackToken;

    const now = ctx.currentTime;

    // Build source + gain
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const hasNextInClip = Array.isArray(clip.nextClip) && clip.nextClip.length > 0;

    const loopEndPoint = (!hasNextInClip)
      ? (clip.loopPoint ?? buffer.duration)
      : (clip.clipEnd ?? buffer.duration);

    source.loop = !hasNextInClip;
    source.loopStart = clip.loopStart || 0;
    source.loopEnd  = loopEndPoint;

    const gainNode = ctx.createGain();
    // apply trackVolume * userVolume (masterGain already applies user; keep trackVolume here)
    const startGain = 0;
    gainNode.gain.setValueAtTime(startGain, now);

    source.connect(gainNode).connect(this.masterGain);
    source.start(0, clip.loopStart || 0);

    // store entry
    entry.source = source;
    entry.gainNode = gainNode;
    entry.startedAt = now;
    entry.offsetAtStart = clip.loopStart || 0;

    // fade in
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    const targetGain = (typeof this.trackVolume === "number" ? this.trackVolume : 1);
    gainNode.gain.linearRampToValueAtTime(targetGain, now + 0.2);

    this.onStatus?.(`Playing: ${clipName}`);
    this.lastPlayingClipName = clipName;

    // --- Auto section behavior: if this section is "auto" and this clip self-loops,
    // queue the next section now, so the scheduler will switch at loopPoint.
    const currSection = this.sectionData[this.currentSectionName];
    if (currSection?.type === "auto") {
      const ns = currSection.nextSection;
      const targets = Array.isArray(ns) ? ns : (ns ? [ns] : []);
      if (targets.length) {
        const selfLoops = Array.isArray(clip.nextClip) && clip.nextClip.includes(clipName);
        if (selfLoops) {
          const chosen = targets[0]; // pick the first if multiple
          if (chosen && this.queuedNextSectionName !== chosen) {
            this.queueSectionTransition(chosen); // updates queued state & notifies UI
          }
        }
      }
    }

    // unified scheduler at loopPoint: handle (1) queued section, (2) queued mode, (3) clip.nextClip
    const timeUntilLoopPoint = (clip.loopPoint ?? buffer.duration) - (clip.loopStart || 0);
    if (timeUntilLoopPoint > 0) {
      const id = setTimeout(() => {
        // If a newer playClip has started since this timer was set, abort.
        if (myToken !== this._playbackToken) {
          // stale timer; do nothing
          return;
        }
        const now2 = ctx.currentTime;

        // (1) Section queued?
        if (this.queuedNextSectionName) {
          // We’re about to jump sections; stop any other pending callbacks.
          this.clearScheduled();

          const targetSection = this.sectionData[this.queuedNextSectionName];
          const nextClipName = targetSection?.firstClip || null;

          // mode selection on section change:
          // default to base; if new section supports currentModeName, keep it
          if (targetSection) {
            const modes = this.getAvailableModes(this.queuedNextSectionName);
            const nextMode = modes.includes(this.currentModeName) ? this.currentModeName : "base";
            this.currentModeName = nextMode;
            this.onModeChange?.(nextMode);
            this.setCurrentSection(this.queuedNextSectionName);
          }
          this.clearQueuedSection();
          this.clearQueuedMode(); // also clear any queued mode

          if (nextClipName && this.clipData[nextClipName] && this.activeClips[nextClipName]) {
            this.playClip(nextClipName);
          }

          // fade out this clip until clipEnd
          const clipEndTime = clip.clipEnd ?? buffer.duration;
          const delta = clipEndTime - (clip.loopPoint ?? buffer.duration);
          gainNode.gain.setValueAtTime(0, now2 + Math.max(0, delta));
          return;
        }

        // (2) Mode queued (same section)?
        if (this.queuedNextModeName) {
          // apply NOW: change currentMode, clear queue; continue normal nextClip transition below
          const modes = this.getAvailableModes(this.currentSectionName);
          const chosen = modes.includes(this.queuedNextModeName) ? this.queuedNextModeName : "base";
          this.currentModeName = chosen;
          this.onModeChange?.(chosen);
          this.clearQueuedMode();
          // do not return; allow clip.nextClip to proceed,
          // but next playClip() will select buffer for new mode
        }

        // (3) Normal nextClip
        if (hasNextInClip) {
          const arr = clip.nextClip;
          const next = arr.length > 1 ? arr[Math.floor(Math.random() * arr.length)] : arr[0];
          if (this.clipData[next] && this.activeClips[next]) {
            this.playClip(next);
          }
        }

        // fade remainder to 0 at clipEnd
        const clipEndTime = clip.clipEnd ?? buffer.duration;
        const delta = clipEndTime - (clip.loopPoint ?? buffer.duration);
        gainNode.gain.setValueAtTime(0, now2 + Math.max(0, delta));
      }, timeUntilLoopPoint * 1000);
      this.scheduledTimeouts.push(id);
    }

    // true end detection for "end" sections: when last clip has no nextClip
    const section = this.sectionData[this.currentSectionName];
    if (!hasNextInClip && section?.type === "end") {
      const tail = (clip.clipEnd ?? buffer.duration) - (clip.loopStart || 0);
      const id2 = setTimeout(() => this.stopTrack(true), tail * 1000 + 60);
      this.scheduledTimeouts.push(id2);
    }
  }

  getPlaybackInfo() {
    // No audio context or nothing playing → nothing to report
    if (!this.audioCtx || !this.lastPlayingClipName) return null;

    const clipName = this.lastPlayingClipName;
    const entry = this.activeClips[clipName];
    const clip  = this.clipData[clipName];
    if (!entry || !clip) return null;

    // Choose the same buffer we used to play (by current mode, fallback base)
    const mode   = this.currentModeName || "base";
    const buffer = (entry.buffersByMode?.[mode]) ?? entry.buffersByMode?.base;
    if (!buffer) return null;

    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    const loopStart = clip.loopStart || 0;
    const loopPoint = (clip.loopPoint ?? buffer.duration);
    const segLen    = Math.max(1e-6, loopPoint - loopStart);

    const startedAt      = entry.startedAt || 0;
    const offsetAtStart  = entry.offsetAtStart || 0;
    const elapsed        = Math.max(0, now - startedAt);
    const position       = offsetAtStart + elapsed;

    // progress from loopStart → loopPoint, clamped [0..1]
    const progress01 = Math.max(0, Math.min(1, (position - loopStart) / segLen));

    return {
      clipName,
      sectionName: this.currentSectionName || this._sectionOfClip(clipName),
      mode,
      position,
      loopStart,
      loopPoint,
      progress01
    };
  }


  schedule(fn, atAudioTime) {
    const ctx = this.ensureContext();
    const ms = Math.max(0, (atAudioTime - ctx.currentTime) * 1000);
    const id = setTimeout(fn, ms);
    this.scheduledTimeouts.push(id);
  }
}
