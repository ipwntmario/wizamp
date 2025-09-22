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

    this._bufferCache = new Map(); // url -> AudioBuffer

    this.fadeOutSeconds = 6;
    this.userGain = 1.0;
    this.pauseFadeSeconds = 1;

    this.isPaused = false;
    this.pausedInfo = null; // { clipName, offsetSeconds? }

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

    // stop-state
    this._stopPendingUntil = 0;     // audio time when the global stop fade ends (0 = none)
    this._stopFinishTimer = null;   // timeout id for finishing stop

    // RNG/debug
    this._seed = null;
    this._rng = Math.random;
    this._rngDraws = 0;
    this._rngDebug = true; // flip to false once things are stable
    // After a mid-clip jump, force the first loopPoint to honor only clip.nextClip
    this._stayInSectionOnce = false;
  }

  /**
   * Snapshot the precise current musical position.
   * Returns null if nothing is playing.
   */
  getNowPlaying() {
    if (!this.audioCtx) return null;
    const clipName = this.lastPlayingClipName;
    if (!clipName) return null;
    const entry = this.activeClips?.[clipName];
    if (!entry) return null;
    const ctx = this.audioCtx;
    const elapsed = Math.max(0, ctx.currentTime - (entry.startedAt || ctx.currentTime));
    const offsetSeconds = (entry.offsetAtStart || 0) + elapsed;
    return {
      trackName: this.currentTrackName || null,
      sectionName: this.currentSectionName || null,
      modeName: this.currentModeName || "base",
      clipName,
      offsetSeconds,
      seed: this._seed ?? null,
      rngDrawCount: this._rngDraws | 0,
    };
  }

  /**
   * Jump to an exact musical position (must already be preloaded).
   * Starts the given clip with an offset, setting section/mode consistently.
   */
  playAtPosition({ sectionName, modeName = "base", clipName, offsetSeconds = 0 } = {}) {
    if (!sectionName || !clipName) return;
    // Set section & mode before starting the clip
    this.setCurrentSection(sectionName);
    this.setCurrentMode(modeName || "base");
    // Ensure first loop after a mid-clip jump doesn’t take queued/section/mode detours
    this._stayInSectionOnce = true;
    // Start the target clip at given offset with no fade-in (to avoid double ramps)
    this.playClip(clipName, { offsetSeconds, skipFadeIn: true });
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

  // Build a safe URL for audio files: encode base path (keeps slashes) and filename.
  _buildAudioUrl(filename) {
    const base = this.trackBase ? String(this.trackBase) : "";
    // encodeURI keeps "/" intact for the base path; it encodes spaces etc.
    const safeBase = encodeURI(base.replace(/([^:])\/{2,}/g, "$1/"));
    // encodeURIComponent for the file segment to handle "&", spaces, etc.
    const safeFile = encodeURIComponent(String(filename));
    // Normalize any accidental doubles again after join
    return `${safeBase}/audio/${safeFile}`.replace(/([^:])\/{2,}/g, "$1/");
  }

  // Load & decode with per-URL cache + loud error logging.
  // meta: { clipName, mode } is optional and only used for better console messages.
  async _loadBufferWithCache(url, ctx, meta = {}) {
    if (this._bufferCache.has(url)) return this._bufferCache.get(url);

    let res, arr, buf;
    try {
      res = await fetch(url);
    } catch (e) {
      console.error("[AUDIO] network error while fetching", { url, ...meta, error: e });
      throw e;
    }

    if (!res.ok) {
      console.error("[AUDIO] fetch failed", {
        url, status: res.status, statusText: res.statusText, ...meta
      });
      throw new Error(`Fetch failed for ${url}: ${res.status} ${res.statusText}`);
    }

    const contentType = res.headers.get("content-type") || "unknown/unknown";
    try {
      arr = await res.arrayBuffer();
    } catch (e) {
      console.error("[AUDIO] failed to read ArrayBuffer", { url, contentType, ...meta, error: e });
      throw e;
    }

    try {
      // slice(0) to detach from the original ArrayBuffer in some browsers
      buf = await ctx.decodeAudioData(arr.slice(0));
    } catch (e) {
      console.error("[AUDIO] decode failed", {
        url,
        contentType,
        bytes: arr?.byteLength ?? 0,
        ...meta,
        error: e
      });
      // Common reasons: wrong URL (404 HTML), non-Vorbis file, corrupted file.
      throw e;
    }

    this._bufferCache.set(url, buf);
    return buf;
  }

  setUserVolume(v) {
    const ctx = this.ensureContext();
    const val = Math.max(0, Math.min(1, Number(v) || 0));
    this.userGain = val;
    if (this.masterGain) {
      // If a stop fade is in progress, don't stomp the ramp.
      const now = ctx.currentTime;
      if (this._stopPendingUntil && now < this._stopPendingUntil) {
        // defer applying; master is ramping to 0
      } else {
        this.masterGain.gain.setValueAtTime(val, now);
      }
    }
  }

  setTrackVolume(v) {
    // Central track volume (0..1)
    const ctx = this.ensureContext();
    const val = Math.max(0, Math.min(1, Number(v) || 0));
    this.trackVolume = val;
    // If a global stop fade is in progress, don't stomp its automation.
    const now = ctx.currentTime;
    if (this._stopPendingUntil && now < this._stopPendingUntil) return;
    // Apply immediately to all active clip gains
    try {
      Object.values(this.activeClips).forEach(({ gainNode }) => {
        if (!gainNode) return;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(val, now);
      });
    } catch {}
  }

  setFadeOutSeconds(n) {
    this.fadeOutSeconds = Math.max(0, Math.min(30, Number(n) || 0));
  }

  setPauseFadeSeconds(n) {
    this.pauseFadeSeconds = Math.max(1, Math.min(30, Number(n) || 1));
  }

  // ---- deterministic RNG API ----
  setRandomSeed(seed) {
    // Accept 32-bit integer; fall back to 1 if someone passes 0/NaN
    const s = (Number(seed) >>> 0) || 1;
    this._seed = s;
    try {
      this._rng = mulberry32(s);
    } catch {
      this._rng = Math.random;
    }
    this._rngDraws = 0;
    if (this._rngDebug) console.log(`[ENGINE][RNG] setRandomSeed=${s}`);
  }
  rand() {
    try {
      const r = this._rng ? this._rng() : Math.random();
      this._rngDraws += 1;
      if (this._rngDebug) console.log(`[ENGINE][RNG] draw#${this._rngDraws} → ${r}`);
      return r;
    } catch {
      const r = Math.random();
      if (this._rngDebug) console.log(`[ENGINE][RNG] draw#${++this._rngDraws} (fallback) → ${r}`);
      return r;
    }
  }

  getRngDrawCount() {
    return this._rngDraws | 0;
  }

  fastForwardRng(n) {
    // Advance RNG deterministically to match GM’s draw count
    const count = Math.max(0, Number(n) | 0);
    if (!count) return;
    for (let i = 0; i < count; i++) {
      // Discarded draws (still increment counter for truthful state)
      const _ = this.rand();
    }
    if (this._rngDebug) console.log(`[ENGINE][RNG] fast-forwarded to draw#${this._rngDraws}`);
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

  /**
   * Hard stop used at a track's true end (end-section, last clip).
   * - No fade
   * - Stop sources now, clear timers
   * - Reset flags & restore master to user volume
   */
  _hardStopAtEnd() {
    if (!this.audioCtx) return;
    const ctx = this.audioCtx;

    // If a soft-stop fade was armed for any reason, cancel it.
    if (this._stopFinishTimer) {
      clearTimeout(this._stopFinishTimer);
      this._stopFinishTimer = null;
    }
    this._stopPendingUntil = 0;

    // Stop all clip sources immediately
    try {
      Object.values(this.activeClips).forEach(({ source }) => {
        try { source && source.stop(); } catch {}
      });
    } catch {}

    // Prevent any additional scheduled transitions from firing
    this.clearScheduled();

    // Reset engine state
    this.activeClips = {};
    this.lastPlayingClipName = null;
    this._isPreloaded = false;
    this.isPaused = false;
    this.pausedInfo = null;

    // Put master back at user volume (so the next Play starts at the right level)
    try {
      const now = ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.userGain ?? 1, now);
    } catch {}

    this.onStatus?.("Stopped");
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

    if (!this.isPlaying && this.currentTrackName && this.currentTrackName !== trackName) {
      this._bufferCache.clear(); // simple policy; or implement an LRU later
    }

    // Decode all clips + all mode files to buffers (no need to start muted loopers)
    this.activeClips = {};
    const clipEntries = Object.entries(this.clipData);

    for (const [clipName, clipObj] of clipEntries) {
      const fileMap = this._normalizeFileMap(clipObj?.file);
      const modes = Object.keys(fileMap);
      if (modes.length === 0) continue;

      const buffersByMode = {};
      for (const modeKey of modes) {
        const fname = fileMap[modeKey];
        if (!fname) continue;

        // NEW: build a safe URL and pass clip/mode meta for precise error logs
        const url = this._buildAudioUrl(fname);
        const buf = await this._loadBufferWithCache(url, this.audioCtx || ctx, {
          clipName,
          mode: modeKey
        });
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
  }

  // ----- stop -----
  stopTrack(withFade = true) {
    if (!this.audioCtx) return;

    const ctx = this.audioCtx;
    const now = ctx.currentTime;
    const fade = withFade ? Math.max(0, Number(this.fadeOutSeconds ?? 0)) : 0;

    // If a stop is already pending, extend or keep the earliest finish
    if (this._stopFinishTimer) {
      clearTimeout(this._stopFinishTimer);
      this._stopFinishTimer = null;
    }

    if (fade > 0) {
      // Let all existing transitions continue. Just fade the MASTER to 0.
      try {
        const g = this.masterGain.gain;
        g.cancelScheduledValues(now);
        // start from current master value (likely == userGain)
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(0, now + fade);
      } catch {}

      this._stopPendingUntil = now + fade;

      this._stopFinishTimer = setTimeout(() => {
        // Finalize stop
        Object.values(this.activeClips).forEach(({ source }) => {
          try { source && source.stop(); } catch {}
        });
        // Now that we’re truly stopped, kill any lingering timeouts (future transitions)
        this.clearScheduled();

        this.activeClips = {};
        this.lastPlayingClipName = null;
        this._isPreloaded = false;
        this.isPaused = false;
        this.pausedInfo = null;

        // Restore master to userGain for the next start
        try {
          this.masterGain.gain.cancelScheduledValues(ctx.currentTime);
          this.masterGain.gain.setValueAtTime(this.userGain, ctx.currentTime);
        } catch {}

        this._stopPendingUntil = 0;
        this._stopFinishTimer = null;
        this.onStatus?.("Stopped");
      }, fade * 1000 + 50);
    } else {
      // Instant stop: stop sources and clear schedules
      Object.values(this.activeClips).forEach(({ source }) => {
        try { source && source.stop(); } catch {}
      });
      this.clearScheduled();
      this.activeClips = {};
      this.lastPlayingClipName = null;
      this._isPreloaded = false;
      this.isPaused = false;
      this.pausedInfo = null;
      try {
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.userGain, now);
      } catch {}
      this._stopPendingUntil = 0;
      this._stopFinishTimer = null;
      this.onStatus?.("Stopped");
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
  playClip = (clipName, opts = {}) => {
    const { offsetSeconds = null, skipFadeIn = false, usePauseFade = false } = opts || {};
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
      console.error(`No buffer for clip '${clipName}' in mode '${mode}' (or base)`, {
        clipName, mode, availableModes: Object.keys(entry.buffersByMode || {})
      });
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
    const startOffset = (offsetSeconds != null) ? offsetSeconds : (clip.loopStart || 0);
    source.start(0, startOffset);

    // store entry
    entry.source = source;
    entry.gainNode = gainNode;
    entry.startedAt = now;
    entry.offsetAtStart = clip.loopStart || 0;

    const targetGain = (typeof this.trackVolume === "number" ? this.trackVolume : 1);

    // Always start by cancelling any old automation
    gainNode.gain.cancelScheduledValues(now);

    /**
     * Fade policy:
     * - Resume(simple):    fade-in over pauseFadeSeconds  (opts.usePauseFade === true)
     * - Resume(complex):   immediate (opts.skipFadeIn === true)
     * - Normal starts / transitions: immediate (no fade)
     */
    if (opts.usePauseFade) {
      // Resume from pause on a simple track — do a symmetric fade-in
      gainNode.gain.setValueAtTime(0, now);
      const fadeInDur = Math.max(1, this.pauseFadeSeconds);
      gainNode.gain.linearRampToValueAtTime(targetGain, now + fadeInDur);
    } else {
      // All other paths: **no fade-in**
      gainNode.gain.setValueAtTime(targetGain, now);
    }

    // Record timing for progress + subsequent pauses
    const startedAt = now;
    const offsetAtStart = startOffset; // whatever you named the computed start offset

    // Keep buffer references consistent
    // If you support per-mode buffers (e.g., entry.buffersByMode), also keep entry.buffer for generic reads.
    this.activeClips[clipName] = {
      source,
      gainNode,
      buffer,          // retain classic field
      buffersByMode: entry.buffersByMode || undefined,
      startedAt,
      offsetAtStart
    };

    // Emit status and remember last playing clip
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

        // On the *first* loop after a mid-clip jump, skip section/mode detours
        const skipHigherPriorityOnce = this._stayInSectionOnce === true;
        if (!skipHigherPriorityOnce) {
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
        }
        // Clear the guard after evaluating priorities once
        this._stayInSectionOnce = false;

        // (3) Normal nextClip
        if (hasNextInClip) {
          const arr = clip.nextClip;
          // Stable order across clients: sort before indexing
          const arr2 = arr.length > 1 ? [...arr].sort() : arr;
          const lpVal = (clip.loopPoint ?? buffer.duration);
          if (this._rngDebug) {
            console.log(`[ENGINE][XITION] clip=${clipName} loopPoint=${lpVal}s options=${JSON.stringify(arr2)} len=${arr2?.length ?? 0}`);
          }
          let next;
          if (arr2.length > 1) {
            const sample = this.rand();
            const idx = Math.floor(sample * arr2.length);
            next = arr2[idx];
            if (this._rngDebug) console.log(`[ENGINE][XITION] choose idx=${idx} → ${next}`);
          } else {
            next = arr2[0];
            if (this._rngDebug) console.log(`[ENGINE][XITION] single-option → ${next}`);
          }
          if (this.clipData[next] && this.activeClips[next]) {
            this.playClip(next);
          } else {
            if (this._rngDebug) {
              console.warn(`[ENGINE][XITION] chosen=${next} not available (clipData=${!!this.clipData[next]} active=${!!this.activeClips[next]})`);
            }
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
      const id2 = setTimeout(() => this._hardStopAtEnd(), tail * 1000);
      this.scheduledTimeouts.push(id2);
    }
  }

  pause(simpleTrack = true) {
    if (!this.audioCtx || !this.lastPlayingClipName) return;
    if (this.isPaused) return;

    const ctx = this.audioCtx;
    const fade = Math.max(1, Number(this.pauseFadeSeconds || 1));
    const entry = this.activeClips[this.lastPlayingClipName];
    if (!entry || !entry.gainNode || !entry.source) return;

    if (!simpleTrack) {
      // Complex: stop further transitions *immediately*
      this.clearScheduled();
    }

    const now = ctx.currentTime;
    try {
      const g = entry.gainNode.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + fade);
    } catch {}

    setTimeout(() => {
      // Compute offset at fade end (simple only)
      let offsetSeconds = null;
      if (simpleTrack) {
        const clipName = this.lastPlayingClipName;
        const buff = this._bufferForClipMode(clipName);
        if (buff) {
          const elapsed = Math.max(0, (ctx.currentTime - entry.startedAt));
          const rawPos = (entry.offsetAtStart || 0) + elapsed;
          const dur = Math.max(1e-6, buff.duration);
          offsetSeconds = ((rawPos % dur) + dur) % dur; // [0,dur)
        }
      }

      try { entry.source.stop(); } catch {}

      this.isPaused = true;
      this.pausedInfo = { clipName: this.lastPlayingClipName, offsetSeconds };
      this.onStatus?.("Paused");
    }, fade * 1000 + 20);
  }

  resume(simpleTrack = true) {
    if (!this.isPaused || !this.pausedInfo) return;
    const { clipName, offsetSeconds } = this.pausedInfo;

    // If buffers are gone, just unpause
    if (!this.clipData[clipName] || !this.activeClips[clipName]) {
      this.isPaused = false;
      this.pausedInfo = null;
      return;
    }

    const opts = simpleTrack
      ? { offsetSeconds: offsetSeconds ?? null, skipFadeIn: false, usePauseFade: true }
      : { offsetSeconds: null, skipFadeIn: true, usePauseFade: false }; // restart from beginning, no fade-in

    if (simpleTrack) {
      console.log("[RESUME simple] offsetSeconds:", offsetSeconds, "fade:", this.pauseFadeSeconds);
    } else {
      console.log("[RESUME complex] restart from beginning (no fade-in)");
    }

    this.playClip(clipName, opts);

    this.isPaused = false;
    this.pausedInfo = null;
  }

  getPlaybackInfo() {
    // If we paused and captured an offset, keep the bar frozen at that location.
    if (this.isPaused && this.pausedInfo) {
      const { clipName, offsetSeconds } = this.pausedInfo;
      const clip = this.clipData?.[clipName];
      const buff = this._bufferForClipMode?.(clipName) || this.activeClips?.[clipName]?.buffer;
      if (clip && buff) {
        const loopStart = clip.loopStart || 0;
        const loopPoint = (clip.loopPoint ?? buff.duration);
        const span = Math.max(1e-6, loopPoint - loopStart);
        const offset = (offsetSeconds != null) ? offsetSeconds : loopStart;
        const rel = Math.max(0, Math.min(1, (offset - loopStart) / span));
        return { progress01: rel };
      }
      return { progress01: 0 };
    }

    // Normal running path
    const clipName = this.lastPlayingClipName;
    const entry = clipName ? this.activeClips?.[clipName] : null;
    const clip  = clipName ? this.clipData?.[clipName] : null;
    const buff  = this._bufferForClipMode?.(clipName) || entry?.buffer;
    const ctx   = this.audioCtx;

    if (!ctx || !entry || !clip || !buff) return { progress01: 0 };

    const loopStart = clip.loopStart || 0;
    const loopPoint = (clip.loopPoint ?? buff.duration);
    const span = Math.max(1e-6, loopPoint - loopStart);

    // Estimate current playhead (offsetAtStart + elapsed)
    const elapsed = Math.max(0, (ctx.currentTime - entry.startedAt));
    const pos = (entry.offsetAtStart || 0) + elapsed;

    // Map to 0..1 between loopStart..loopPoint (wrapping if necessary)
    const dur = Math.max(1e-6, buff.duration);
    const posWrapped = ((pos % dur) + dur) % dur;
    const clamped = Math.max(loopStart, Math.min(loopPoint, posWrapped));
    const rel = Math.max(0, Math.min(1, (clamped - loopStart) / span));

    return { progress01: rel };
  }

  schedule(fn, atAudioTime) {
    const ctx = this.ensureContext();
    const ms = Math.max(0, (atAudioTime - ctx.currentTime) * 1000);
    const id = setTimeout(fn, ms);
    this.scheduledTimeouts.push(id);
  }

  _bufferForClipMode(clipName) {
    const entry = this.activeClips?.[clipName];
    if (!entry) return null;
    const mode = this.currentModeName || "base";
    // If you load per-mode buffers into entry.buffersByMode, select it; otherwise fall back to entry.buffer
    return entry.buffersByMode?.[mode] ?? entry.buffer ?? null;
  }

  // Accept both styles:
  // - "file": "Foo.ogg"                -> { base: "Foo.ogg" }
  // - "file": { base: "Foo.ogg", ... } -> unchanged
  _normalizeFileMap(fileField) {
    if (!fileField) return {};
    if (typeof fileField === "string") {
      return { base: fileField };
    }
    if (typeof fileField === "object") {
      return fileField;
    }
    console.warn("[ENGINE] Unexpected 'file' field type:", typeof fileField, fileField);
    return {};
  }
}

function mulberry32(a) {
  return function() {
    let t = (a += 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
