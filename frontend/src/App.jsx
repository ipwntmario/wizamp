/**
 * Wizamp
 * A Dynamic Music Web Application
 *
 * Note: The majority of this code was written by ChatGPT (models 4o and 5), but the overall function and design was
 * handled by me, Dylan Travers. It is first and foremost a personal project created out of the desire for such a thing
 * to exist, and to be used for an ongoing TTRPG group that I am a part of and write music for. I've searched high and
 * low and couldn't find any form of dynamic music engine, or at least any that I could use my own music with. Thus, I
 * figured, if it doesn't exist, I should make it exist.
 *
 * Because it's AI assisted, I don't claim for any code within this project to demonstrate my own raw coding abilities.
 * However, if it is to be assessed in any way, I can make the claim that it demontrates my ability to concieve of a
 * useful applciation, my ability to communicate goals, and work with others until those goals are achieved. My
 * attention to detail should be evident, as well as my careful consideration of what features to work on when in order
 * for adequate testing to be done.
 */

import { useEffect, useMemo, useRef, useState, useCallback  } from "react";
import { AudioEngine } from "./audio/audioEngine";
import { useMusicData } from "./data/useMusicData";
import { useSession } from "./net/useSession";
import { useRoom } from "./net/useRoom";
import LeftPanel from "./components/LeftPanel";
import DatabaseModal from "./components/DatabaseModal";
import SettingsModal from "./components/SettingsModal";
import Icon from "./components/Icon";
import TrackSelector from "./components/TrackSelector";
import SectionPanel from "./components/SectionPanel";
import Transport from "./components/Transport";
import StatusBar from "./components/StatusBar";

// Auto-import all PNGs in /assets/icons at build time
const _iconModules = import.meta.glob("./assets/icons/*.png", { eager: true });
const icons = Object.fromEntries(
  Object.entries(_iconModules).map(([path, mod]) => [
    path.split("/").pop(),            // "icon1.png"
    mod.default ?? mod,               // the URL
  ])
);
const allIconNames = Object.keys(icons).sort();

export default function App() {
  const { tracks, loading, error: dataError } = useMusicData();  // <- only rely on tracks here
  const [clips, setClips] = useState({});
  const [sections, setSections] = useState({});

  const [appIconName, setAppIconName] = useState(() => allIconNames[0] ?? "");

  const [status, setStatus] = useState("Idle");
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [playingTrackName, setPlayingTrackName] = useState(null);
  const [isLoadingTrack, setIsLoadingTrack] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  // Section state used by the UI
  const [currentSectionName, setCurrentSectionName] = useState(null);
  const [queuedSectionName, setQueuedSectionName] = useState(null);

  // derive playing state
  const isPlaying = /^Playing/.test(status);
  const isPaused = status === "Paused";
  const isActive = isPlaying || isPaused;

  // Mirrors of state for engine callbacks (avoid stale closures)
  const selectedTrackRef = useRef(null);
  const playingTrackNameRef = useRef(null);
  const autoplayRef = useRef(false);
  const roomRef = useRef(null);
  const loadBusyRef = useRef(false);
  const failedLoadRef = useRef(null);

  // Mirrors of state for net callbacks

  // After late-join hydrate, ignore any queued sections/modes from room STATE for a moment
  const ignoreQueueUntilMsRef = useRef(0);
  const setHydrateGuard = useCallback((ms=3000) => { ignoreQueueUntilMsRef.current = Date.now() + ms; }, []);
  const shouldIgnoreQueues = useCallback(() => Date.now() < (ignoreQueueUntilMsRef.current || 0), []);

  // Autoplay setting (persist)
  const [autoplay, setAutoplay] = useState(() => {
    try { return localStorage.getItem("wizamp_autoplay") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("wizamp_autoplay", autoplay ? "1" : "0"); } catch {}
  }, [autoplay]);

  // Keep track of the last ended track for correct Autoplay functionality
  const lastEndedTrackRef = useRef(null);

  // Requested autoplay target, consumed after assets and room clients are ready.
  const [autoStartRequestedFor, setAutoStartRequestedFor] = useState(null);

  // Auto-start for late joiners
  const pendingPlayRef = useRef(null); // { trackName, sectionName, serverMs } or null

  const sendSyncResponseRef = useRef(null);

  // Status visibility (persist)
  const [showStatus, setShowStatus] = useState(() => {
    try { return localStorage.getItem("wizamp_showStatus") !== "0"; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem("wizamp_showStatus", showStatus ? "1" : "0"); } catch {}
  }, [showStatus]);

  const { roomId, setRoomId, onlineEnabled, role, setRole, displayName, setDisplayName } = useSession();
  const isActiveRole = !onlineEnabled || role === "GM";
  const isPassiveRole = onlineEnabled && role === "PASSIVE";

  // Audio unlock for Chrome late-joiners
  const [audioLocked, setAudioLocked] = useState(false);

  // Track if a net "start" arrived while audio was locked, so we can resync after unlock
  const [pendingNetStart, setPendingNetStart] = useState(null); // or useRef(null)

  // Modes
  const [currentModeName, setCurrentModeName] = useState("base");
  const [queuedModeName, setQueuedModeName] = useState(null);

  // Users panel

  // Settings modal
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fadeOutSeconds, setFadeOutSeconds] = useState(6); // default 4
  const [pauseFadeSeconds, setPauseFadeSeconds] = useState(() => {
    try { return Number(localStorage.getItem("wizamp_pauseFade")) || 1; } catch { return 1; }
  });

  // Database modal
  const [dbOpen, setDbOpen] = useState(false);

  // App.jsx (top-level state)
  const [dbSort, setDbSort] = useState(() => localStorage.getItem("wizamp_dbSort") || "alpha-asc");
  const [dbDynamicFirst, setDbDynamicFirst] = useState(() => localStorage.getItem("wizamp_dbDynamicFirst") !== "false"); // default true
  const [dbHideTests, setDbHideTests] = useState(() => localStorage.getItem("wizamp_dbHideTests") === "true");

  // Pinned tracks (persisted as array of names)
  const [pinned, setPinned] = useState(() => {
    try {
      const raw = localStorage.getItem("wizamp_pinned");
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  });

  const togglePin = (name) => {
    setPinned(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };


  const [clipProgress, setClipProgress] = useState(0);  // 0..1 visual bar

  // Volume settings
  const [trackVolUIOpen, setTrackVolUIOpen] = useState(false);
  const [trackVolume, setTrackVolume] = useState(1); // 0..1
  const [userVolume, setUserVolume] = useState(1);   // 0..1 (local)
  const [userMuted, setUserMuted] = useState(false);

  // Rename registry (persisted)
  // Shape:
  // names = {
  //   tracks:   { [trackName]: { displayName?: string } },
  //   sections: { [trackName]: { [sectionKey]: { displayName?: string, buttonName?: string, baseModeName?: string } } },
  //   modes:    { [trackName]: { [sectionKey]: { [modeName]: { displayName?: string } } } }
  //   // base mode uses key "__base__" in modes OR sections.baseModeName
  // }
  const [names, setNames] = useState(() => {
    try {
      const raw = localStorage.getItem("wizamp_names");
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem("wizamp_names", JSON.stringify(names)); } catch {}
  }, [names]);

  // Helpers to read effective labels with overrides
  const getTrackTitle = (trackName) => {
    return names?.tracks?.[trackName]?.displayName
        ?? tracks?.[trackName]?.defaultDisplayName
        ?? trackName;
  };

  const getSectionTitle = (trackName, sectionKey) => {
    return names?.sections?.[trackName]?.[sectionKey]?.displayName
        ?? sections?.[sectionKey]?.defaultDisplayName
        ?? sectionKey;
  };

  const getSectionButton = (trackName, sectionKey) => {
    // order: explicit button override → defaultButtonName → effective section title (renames) → key
    const overrideBtn = names?.sections?.[trackName]?.[sectionKey]?.buttonName;
    if (overrideBtn != null && overrideBtn !== "") return overrideBtn;
    const s = sections?.[sectionKey];
    if (s?.defaultButtonName) return s.defaultButtonName;
    // fall back to the *renamed* section title if present
    return getSectionTitle(trackName, sectionKey) ?? sectionKey;
  };

  const getBaseModeName = (trackName, sectionKey) => {
    return names?.sections?.[trackName]?.[sectionKey]?.baseModeName
        ?? sections?.[sectionKey]?.defaultBaseModeName
        ?? "base";
  };

  const getModeLabel = (trackName, sectionKey, modeName) => {
    if (modeName === "__base__") return getBaseModeName(trackName, sectionKey);
    return names?.modes?.[trackName]?.[sectionKey]?.[modeName]?.displayName
        ?? modeName;
  };

  // Create engine once
  const engineRef = useRef(null);
  if (!engineRef.current) {
    engineRef.current = new AudioEngine({
      onStatus: async (s) => {
        console.log("[STATUS]", s);
        setStatus(s);
        if (s === "Stopped") {
          setClipProgress(0);

          const playing = playingTrackNameRef.current;
          const sel = selectedTrackRef.current;
          console.log("[STOP] was playing:", playing, "selected:", sel);
          lastEndedTrackRef.current = playing || null;
          setPlayingTrackName(null);

          // If Auto-Play is ON, and dropdown points to a *different* track,
          // request auto-start for that track (we will start AFTER preload completes).
          if (autoplayRef.current && sel && sel !== lastEndedTrackRef.current) {
            setAutoStartRequestedFor(sel);
            console.log("[AUTOPLAY] requested for", sel);
          } else {
            console.log("[AUTOPLAY] not requested (autoplay:", autoplayRef.current,
                        "selected:", sel, "lastEnded:", lastEndedTrackRef.current, ")");
            setAutoStartRequestedFor(null);
          }
        }
      },

      onSectionChange: (name) => setCurrentSectionName(name ?? null),
      onQueueChange: (nameOrNull) => setQueuedSectionName(nameOrNull),
      onModeChange: (modeName) => setCurrentModeName(modeName || "base"),
      onModeQueueChange: (nameOrNull) => setQueuedModeName(nameOrNull),
      onReady: () => { setClipProgress(0); },  // when engine finished resetting
    });
  }
  const engine = engineRef.current;

  // === Verification timers for late-join drift correction ===
  const verifyTimer1Ref = useRef(null);
  const verifyTimer2Ref = useRef(null);
  const verifyingRef = useRef(false);

  const scheduleSyncVerificationRef = useRef(null);

  // Audio unlock for late joiners
  useEffect(() => {
    const st = engine.getAudioState?.();
    setAudioLocked(st !== "running");
  }, [engine]);

  const handleEnableAudio = async () => {
    await engine.unlockAudio?.();
    setAudioLocked(engine.getAudioState?.() !== "running" ? true : false);

    // If we deferred a net start while locked, ask the GM for a fresh snapshot now.
    if (engine.getAudioState?.() === "running" && pendingNetStart) {
      try { room?.requestSync?.(); } catch {}
      setPendingNetStart(null);
    }

    // If we arrived mid-session, re-request sync to jump in immediately
    if (!pendingNetStart) room.requestSync();
  };

  // Keep engine fade setting in sync
  useEffect(() => {
    engine.setFadeOutSeconds?.(fadeOutSeconds);
  }, [engine, fadeOutSeconds]);

  useEffect(() => {
    engine.setPauseFadeSeconds?.(pauseFadeSeconds);
    try { localStorage.setItem("wizamp_pauseFade", String(pauseFadeSeconds)); } catch {}
  }, [engine, pauseFadeSeconds]);

  // Keep refs in sync
  useEffect(() => { selectedTrackRef.current = selectedTrack; }, [selectedTrack]);
  useEffect(() => { playingTrackNameRef.current = playingTrackName; }, [playingTrackName]);
  useEffect(() => { autoplayRef.current = autoplay; }, [autoplay]);

  // Track select menu persist (optional)
  useEffect(() => { localStorage.setItem("wizamp_dbSort", dbSort); }, [dbSort]);
  useEffect(() => { localStorage.setItem("wizamp_dbDynamicFirst", String(dbDynamicFirst)); }, [dbDynamicFirst]);
  useEffect(() => { localStorage.setItem("wizamp_dbHideTests", String(dbHideTests)); }, [dbHideTests]);

  // Pinned effect
  useEffect(() => {
    try {
      localStorage.setItem("wizamp_pinned", JSON.stringify(Array.from(pinned)));
    } catch {}
  }, [pinned]);


  // When a track is selected, point UI at its first section
  useEffect(() => {
    if (isActive) return;         // ← don’t switch UI when playing *or paused*
    if (!selectedTrack) {
      setCurrentSectionName(null);
      setQueuedSectionName(null);
      return;
    }
    const first = tracks[selectedTrack]?.firstSection || null;
    setCurrentSectionName(first);
    setQueuedSectionName(null);
  }, [selectedTrack, tracks, isActive]);

  // Derived: firstSection of the selected track (for Transport button label)
  const firstSection = useMemo(() => {
    if (!selectedTrack) return null;
    const track = tracks[selectedTrack];
    return track ? track.firstSection : null;
  }, [selectedTrack, tracks]);

  const autoLockedTargets = useMemo(() => {
    const section = sections[currentSectionName];
    if (section?.type !== "auto") return [];
    const ns = section?.nextSection;
    return Array.isArray(ns) ? ns : (ns ? [ns] : []);
  }, [sections, currentSectionName]);

  // RAF loop for clip progress
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const info = engine.getPlaybackInfo?.();
      // Freeze during pause: keep the last rendered value.
      setClipProgress(prev => (isPaused ? prev : (info?.progress01 ?? 0)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine, isPaused]);

  // derive if not "simple" track
  const isDynamicPlayingTrack = playingTrackName && tracks[playingTrackName]?.simple === false;

  // Handlers
  const handlePlay = async () => {
    await engine.unlockAudio();
    // If audio is locked, don't start or advance RNG. Defer until unlock, then re-sync.
    if (engine.getAudioState?.() !== "running") {
      setAudioLocked(true);           // show the banner if you have it
      setPendingNetStart({ type: "PLAY", ts: Date.now() });
      // Do not call engine.play... here. Just wait for unlock.
      return;
    }

    if (isLoadingTrack) return;  // <-- early bail

    if (!engine.isPreloaded || playingTrackName !== selectedTrack) return;

    const target = currentSectionName || firstSection;
    if (target) {
      if (room.onlineActive && isActiveRole) {
        // enforce ready gate by default
        if (!room.allReady) {
          // Show something lightweight to the active user; you can replace with your modal/toast
          console.warn("Not all players are ready:", room.users.filter(u => !u.ready).map(u => u.name));
          // Optionally, uncomment to force play anyway:
          // room.requestPlay({ trackName: selectedTrack, sectionName: target, delayMs: 2000, override: true });
          return;
        }
        room.requestPlay({ trackName: selectedTrack, sectionName: target, delayMs: 2000 });
      } else {
        engine.playSection(target);
      }
    }
  };

  const handlePause = () => {
    const simple = !!tracks[playingTrackName || selectedTrack]?.simple;
    if (room.onlineActive && isActiveRole) {
      room.requestPause();
    } else {
      engine.pause(simple);
    }
  };

  const handleResume = async () => {
    await engine.unlockAudio();
    if (engine.getAudioState?.() !== "running") {
      setAudioLocked(true);
      setPendingNetStart({ type: "RESUME", ts: Date.now() });
      return;
    }

    const simple = !!tracks[playingTrackName || selectedTrack]?.simple;
    if (room.onlineActive && isActiveRole) {
      room.requestResume({ delayMs: 1000 }); // small lead time like Play
    } else {
      engine.resume(simple);
    }
  };

  const handleStop = async () => {

    if (room.onlineActive && isActiveRole) {
      // Tell everyone to stop (with fade)
      room.requestStop(true);
    } else {
      // Local stop only

      engine.stopTrack(true);
    }
  };


  const loadSavedTrackVolume = useCallback((name) => {
    try {
      const k = `wizamp:trackVolume:${name}`;
      const v = localStorage.getItem(k);
      const num = v == null ? 1 : Math.max(0, Math.min(1, Number(v)));
      return Number.isFinite(num) ? num : 1;
    } catch { return 1; }
  }, []);

  const saveTrackVolume = (name, vol) => {
    try {
      const k = `wizamp:trackVolume:${name}`;
      localStorage.setItem(k, String(vol));
    } catch {}
  };

  const handleSelectTrack = useCallback((name) => {

    // Only update selection + volume now; actual loading is deferred until STOP.
    if (failedLoadRef.current === name) setLoadAttempt(attempt => attempt + 1);
    selectedTrackRef.current = name;
    failedLoadRef.current = null;
    setSelectedTrack(name);
    const savedVol = loadSavedTrackVolume(name);
    setTrackVolume(savedVol);
  }, [loadSavedTrackVolume]);

  // Called when server sends STATE { name, seed, ... }.
  // It should ONLY select/preload, never start playback here.
  const onSetTrack = useCallback(({ name, seed }) => {
    if (!name) return;

    // If already on this track, do nothing unless we're idle.
    const local = engine.getNowPlaying?.(); // {trackName, ...} or null
    const alreadySelected = selectedTrack === name || local?.trackName === name;

    if (alreadySelected) {
      // Optional: only reseed when we're not actively playing
      if (!isPlaying && seed != null) {
        console.log("[APP] engine.setRandomSeed(seed) (idle reseed)");
        engine.setRandomSeed?.(seed >>> 0);
      }
      return; // <- prevent any restart
    }

    // Not on this track yet: select & preload (no auto-start here)
    console.log("[APP] onSetTrack select/preload only:", name);
    if (seed != null) {
      engine.setRandomSeed?.(seed >>> 0);
    }
    handleSelectTrack(name); // this triggers the preload effect below
  }, [engine, selectedTrack, handleSelectTrack, isPlaying]);


  const loadTrackAssets = useCallback(async (name) => {
    if (!name || engine.isPlaying || loadBusyRef.current) return;
    loadBusyRef.current = true;
    setIsLoadingTrack(true);
    roomRef.current?.setReady(false);
    try {
      const basePath = tracks[name]?.basePath || `/tracks/${name}`;
      const responses = await Promise.all(['clipData', 'sectionData'].map(file => fetch(`${basePath}/${file}.json`)));
      if (responses.some(response => !response.ok)) throw new Error('Could not load track metadata');
      const [clipJson, sectionJson] = await Promise.all(responses.map(response => response.json()));
      if (selectedTrackRef.current !== name) return;
      const nextClips = clipJson.clips || clipJson;
      const nextSections = sectionJson.sections || sectionJson;
      engine.setData({ clips: nextClips, sections: nextSections, tracks });
      await engine.preloadTrack(name, { trackVolume: loadSavedTrackVolume(name), basePath });
      if (selectedTrackRef.current !== name) {
        setPlayingTrackName(null);
        return;
      }
      setClips(nextClips);
      setSections(nextSections);
      setPlayingTrackName(name);
      setClipProgress(0);
      failedLoadRef.current = null;
      roomRef.current?.setReady(true);
      if (pendingPlayRef.current?.trackName === name) {
        pendingPlayRef.current = null;
        roomRef.current?.requestSync();
      }
    } catch (err) {
      failedLoadRef.current = name;
      setStatus(`Failed to load ${name}: ${err.message}. Select the track again to retry.`);
    } finally {
      loadBusyRef.current = false;
      setIsLoadingTrack(false);
    }
  }, [engine, tracks, loadSavedTrackVolume]);

  const scheduledCommandsRef = useRef(new Set());
  const cancelScheduledCommands = useCallback(() => {
    scheduledCommandsRef.current.forEach(clearTimeout);
    scheduledCommandsRef.current.clear();
  }, []);
  const scheduleAtServerTime = useCallback((serverMs, fn) => {
    const delay = Math.max(0, serverMs - (roomRef.current?.serverNowMs() ?? Date.now()));
    const id = setTimeout(() => { scheduledCommandsRef.current.delete(id); fn(); }, delay);
    scheduledCommandsRef.current.add(id);
  }, []);
  useEffect(() => cancelScheduledCommands, [cancelScheduledCommands, roomId, onlineEnabled]);

  const onPauseMsg = useCallback(() => {
    cancelScheduledCommands();
    const simple = !!tracks[playingTrackName || selectedTrack]?.simple;

    engine.pause(simple);
  }, [tracks, playingTrackName, selectedTrack, engine, cancelScheduledCommands]);

  const onStopMsg = useCallback((fade = true) => {
    cancelScheduledCommands();
    pendingPlayRef.current = null;
    engine.stopTrack(fade);
  }, [engine, cancelScheduledCommands]);

  const onResumeMsg = useCallback((serverMs) => {
    const simple = !!tracks[playingTrackName || selectedTrack]?.simple;
    scheduleAtServerTime(serverMs, () => {

      engine.resume(simple);
    });
  }, [tracks, playingTrackName, selectedTrack, engine, scheduleAtServerTime]);

  const onQueueSectionMsg = useCallback((name) => {
    if (shouldIgnoreQueues()) {
      console.log("[SYNC][IGNORE] dropping stale QUEUE_SECTION during hydrate window:", name);
      return;
    }
    setQueuedSectionName(name || null);
    if (name) engine.queueSectionTransition?.(name);
  }, [engine, shouldIgnoreQueues]);

  const onClearSectionQueueMsg = useCallback(() => {
    setQueuedSectionName(null);
    engine.clearQueuedSection?.();
  }, [engine]);

  const onQueueModeMsg = useCallback((name) => {
    if (shouldIgnoreQueues()) {
      console.log("[SYNC][IGNORE] dropping stale QUEUE_MODE during hydrate window:", name);
      return;
    }
    setQueuedModeName(name || null);
    if (name) engine.queueModeTransition?.(name);
  }, [engine, shouldIgnoreQueues]);

  const onClearModeQueueMsg = useCallback(() => {
    setQueuedModeName(null);
    engine.clearQueuedMode?.();
  }, [engine]);

  const onSetTrackVolumeMsg = useCallback((vol) => {
    const v = Math.max(0, Math.min(1, Number(vol)));
    setTrackVolume(v);
    if (playingTrackName) saveTrackVolume(playingTrackName, v);
    engine.setTrackVolume?.(v);
  }, [engine, playingTrackName]);

  const onSetAutoplayMsg = useCallback((val) => {
    setAutoplay(!!val);
  }, []);

  const onSyncRequestMsg = useCallback((requesterId) => {
    // Build a precise snapshot from the engine (GM side)
    const snapshot = engine.getNowPlaying?.();
    if (!snapshot) return;

    // Current draw count up to "now"
    const drawCount =
      (engine.getRngDrawCount?.() != null
        ? engine.getRngDrawCount()
        : (snapshot.rngDrawCount ?? 0));

    const state = {
      ...snapshot,              // {trackName, sectionName, modeName, clipName, offsetSeconds, seed, ...}
      volume: trackVolume ?? 1, // include current room volume for the joiner
      rngDrawCount: drawCount,  // for debugging / fallback
      rngNext: drawCount + 1,   // <- the next draw the GM will consume at the next boundary
    };

    // Use the ref (may still be null on first render; that’s OK)
    sendSyncResponseRef.current?.(requesterId, state);
  }, [engine, trackVolume]);

  // Schedule a verification SYNC right after the next loop boundary
  useEffect(() => {
    scheduleSyncVerificationRef.current = () => {
      // clear any previous timers
      if (verifyTimer1Ref.current) { clearTimeout(verifyTimer1Ref.current); verifyTimer1Ref.current = null; }
      if (verifyTimer2Ref.current) { clearTimeout(verifyTimer2Ref.current); verifyTimer2Ref.current = null; }

      const nowPlaying = engine.getNowPlaying?.();
      if (!nowPlaying) return;

      const { clipName, offsetSeconds = 0 } = nowPlaying;

      // You already have this helper; if not, inline the lookup from `clips`.
      const c = clips?.[clipName];
      const lp = c ? Number(c.loopPoint) : null;

      // If we can’t resolve loopPoint/offset, do two coarse checks
      if (!lp || offsetSeconds == null) {
        verifyingRef.current = true;
        verifyTimer1Ref.current = setTimeout(() => requestSyncRef.current?.(), 900);
        verifyTimer2Ref.current = setTimeout(() => requestSyncRef.current?.(), 1600);
        return;
      }

      const remainMs = Math.max(60, (lp - offsetSeconds) * 1000);
      verifyingRef.current = true;

      // Right after boundary
      verifyTimer1Ref.current = setTimeout(() => requestSyncRef.current?.(), remainMs + 20);
      // Backup mid-next-clip
      verifyTimer2Ref.current = setTimeout(() => requestSyncRef.current?.(), remainMs + 420);
    };

    // Cleanup on unmount
    return () => {
      if (verifyTimer1Ref.current) { clearTimeout(verifyTimer1Ref.current); verifyTimer1Ref.current = null; }
      if (verifyTimer2Ref.current) { clearTimeout(verifyTimer2Ref.current); verifyTimer2Ref.current = null; }
    };
  }, [engine, clips]); // NOTE: no `room` and no `onSyncStateMsg` here

  const onSyncStateMsg = useCallback((snapshot) => {
    // (A) If the snapshot happens to include queued fields, never enact them here.
    //     We only *display* queues on the GM and we execute queues via explicit QUEUE_* events.
    if (snapshot?.queuedSection || snapshot?.queuedMode) {
      const qs = snapshot?.queuedSection ?? null;
      const qm = snapshot?.queuedMode ?? null;
      if (!isActiveRole || shouldIgnoreQueues()) {
        console.log("[SYNC_STATE][IGNORE] queued fields present in snapshot (hydrate/non-GM):", { qs, qm });
      } else {
        console.log("[SYNC_STATE] queued fields (GM display only):", { qs, qm });
      }
    }

    // (B) Verification path (post-hydrate re-check)
    if (verifyingRef.current) {
      verifyingRef.current = false;
      if (verifyTimer1Ref.current) { clearTimeout(verifyTimer1Ref.current); verifyTimer1Ref.current = null; }
      if (verifyTimer2Ref.current) { clearTimeout(verifyTimer2Ref.current); verifyTimer2Ref.current = null; }

      const local = engine.getNowPlaying?.();
      const localDraw  = engine.getRngDrawCount?.() | 0;
      const remoteDraw = (snapshot?.rngDrawCount | 0);
      const drawDiff   = remoteDraw - localDraw;

      // RNG correction (authoritative = remote/GM)
      if (drawDiff !== 0) {
        console.log("[VERIFY][RNG] correcting draw from", localDraw, "to", remoteDraw);
        if (Number.isFinite(snapshot?.seed)) engine.setRandomSeed?.(snapshot.seed);
        engine.fastForwardRng?.(remoteDraw);
      }

      // Positional correction (authoritative = remote/GM)
      const needJump =
        !local ||
        local.sectionName !== snapshot?.sectionName ||
        local.modeName    !== snapshot?.modeName ||
        local.clipName    !== snapshot?.clipName ||
        Math.abs((local?.offsetSeconds || 0) - (snapshot?.offsetSeconds || 0)) > 0.06;

      if (needJump) {
        console.log("[VERIFY] position correction →", {
          section: snapshot?.sectionName,
          mode:    snapshot?.modeName,
          clip:    snapshot?.clipName,
          off:     snapshot?.offsetSeconds
        });

        // Clear any stale queues before we jump
        engine.clearQueuedSection?.();
        setQueuedSectionName(null);
        engine.clearQueuedMode?.();
        setQueuedModeName(null);

        // Hydrate guard so any delayed QUEUE_* from STATE can’t fire right away
        setHydrateGuard(3000);

        engine.playAtPosition?.({
          sectionName: snapshot?.sectionName,
          modeName:    snapshot?.modeName || "base",
          clipName:    snapshot?.clipName,
          offsetSeconds: Math.max(0, Number(snapshot?.offsetSeconds) || 0),
          warmStartDeltaSec: 0
        });

        // Schedule a follow-up verification
        scheduleSyncVerificationRef.current?.();

        // Re-allow queues after we’ve scheduled verification
        ignoreQueueUntilMsRef.current = 0;
      } else {
        console.log("[VERIFY] already in sync.");
      }
      return;
    }

    // (C) Normal late-join hydrate
    const name = snapshot?.trackName || snapshot?.name || snapshot?.selectedTrack || null;
    if (!name) return;

    // Don’t re-preload if we already have this track loaded
    const sameTrackAndLoaded = (playingTrackName === name) && !!engine.isPreloaded;

    // Apply seed + fast-forward RNG to the exact draw count in the snapshot.
    if (Number.isFinite(snapshot?.seed)) {
      engine.setRandomSeed?.(snapshot.seed);
    }
    const draws = (snapshot?.rngDrawCount | 0);
    if (draws > 0) engine.fastForwardRng?.(draws);

    if (sameTrackAndLoaded) {
      // Clear any stale queues before the precise jump
      engine.clearQueuedSection?.();
      setQueuedSectionName(null);
      engine.clearQueuedMode?.();
      setQueuedModeName(null);

      // Hydrate guard so queued items in STATE can't re-fire right away
      setHydrateGuard(3000);

      // Jump into exact musical position
      engine.playAtPosition?.({
        sectionName: snapshot.sectionName,
        modeName:    snapshot.modeName || "base",
        clipName:    snapshot.clipName,
        offsetSeconds: Math.max(0, Number(snapshot.offsetSeconds) || 0),
        warmStartDeltaSec: 0
      });

      // Verify on/after next boundary
      scheduleSyncVerificationRef.current?.();
      ignoreQueueUntilMsRef.current = 0;
      return;
    }

    // Not preloaded yet: select & preload. Your preload path already re-requests a SYNC after load.
    pendingPlayRef.current = { trackName: name };
    handleSelectTrack(name);
  }, [
    engine,
    playingTrackName,
    isActiveRole,          // ⬅️ use this (your code’s “GM” boolean)
    shouldIgnoreQueues,
    setHydrateGuard,
    scheduleSyncVerificationRef,
    handleSelectTrack
  ]);

  const room = useRoom({
    onlineEnabled,
    roomId,
    displayName,
    role,
    onSetTrack,
    onPlay: ({ trackName, sectionName, serverMs }) => {
      setAutoStartRequestedFor(null);
      // Late-join friendliness:
      // 1) If assets not ready, ensure selection + preload first.
      // 2) After preload, schedule at max(serverMs, serverNow + 1500ms) so everyone lines up.
      const needPreload = !playingTrackName || playingTrackName !== trackName;
      // Snap the UI track selector if needed (no load yet)
      if (trackName && trackName !== selectedTrack) handleSelectTrack(trackName);
      if (!sectionName || !serverMs) return;
      if (needPreload || isLoadingTrack) {
        pendingPlayRef.current = { trackName, sectionName, serverMs };
      } else {
        // We are ready: schedule with a safety lead time if serverMs already passed
        const now = room.serverNowMs ? room.serverNowMs() : Date.now();
        const target = Math.max(serverMs, now);
        scheduleSectionAtServerTime(sectionName, target);
      }
    },
    onPause: onPauseMsg,
    onStop: onStopMsg,
    onResume: onResumeMsg,
    onQueueSection: onQueueSectionMsg,
    onClearSectionQueue: onClearSectionQueueMsg,
    onQueueMode: onQueueModeMsg,
    onClearModeQueue: onClearModeQueueMsg,
    onSetTrackVolume: onSetTrackVolumeMsg,
    onSetAutoplay: onSetAutoplayMsg,
    onSyncRequest: onSyncRequestMsg,
    onSyncState: onSyncStateMsg,
  });
  useEffect(() => { roomRef.current = room; }, [room]);

  const roomState = {
    isOnline: onlineEnabled,
    users: room?.users ?? [],
    latencyMs: room?.latencyMs ?? null,
    serverOffsetMs: room?.offsetMs ?? null,
  };

  // Proxies to avoid cyclic deps
  const requestSyncRef = useRef(null);
  useEffect(() => {
    requestSyncRef.current = () => room?.requestSync?.();
  }, [room]);

  useEffect(() => {
    sendSyncResponseRef.current = room.sendSyncResponse;
    return () => { sendSyncResponseRef.current = null; };
  }, [room.sendSyncResponse]);

  // Selection changes during playback take effect only after a complete stop.
  useEffect(() => {
    if (!isActive && !isLoadingTrack && selectedTrack && failedLoadRef.current !== selectedTrack
        && (!playingTrackName || selectedTrack !== playingTrackName)) {
      loadTrackAssets(selectedTrack);
    }
  }, [isActive, isLoadingTrack, selectedTrack, playingTrackName, loadTrackAssets, loadAttempt]);

  // One autoplay decision, after preload and (online) the room readiness barrier.
  useEffect(() => {
    const name = autoStartRequestedFor;
    if (name && (!autoplay || name !== selectedTrack)) {
      setAutoStartRequestedFor(null);
      return;
    }
    if (!name || name !== selectedTrack || name !== playingTrackName || isLoadingTrack || isActive) return;
    const sectionName = tracks[name]?.firstSection;
    if (!sectionName) return;
    if (room.onlineActive) {
      if (!isActiveRole || !room.connected || !room.allReady) return;
      room.requestPlay({ trackName: name, sectionName });
    } else {
      engine.playSection(sectionName);
    }
    setAutoStartRequestedFor(null);
  }, [autoplay, autoStartRequestedFor, selectedTrack, playingTrackName, isLoadingTrack, isActive, tracks, room, isActiveRole, engine]);

  // Set user volume
  useEffect(() => {
    engine.setUserVolume?.(userMuted ? 0 : userVolume);
  }, [engine, userVolume, userMuted]);

  // Persist the selected track's slider changes (always)
  useEffect(() => {
    // whenever trackVolume changes for the selected track, apply + persist
    if (!selectedTrack) return;
    saveTrackVolume(selectedTrack, trackVolume);
  }, [selectedTrack, trackVolume]);

  // Apply volume to the engine for the playing track only
  useEffect(() => {
    if (!playingTrackName) return;
    // If the selected track is the one playing, use the slider value
    if (selectedTrack === playingTrackName) {
      engine.setTrackVolume?.(trackVolume);
    } else {
      // Otherwise, load the saved volume for the currently playing track
      const v = loadSavedTrackVolume(playingTrackName);
      engine.setTrackVolume?.(v);
    }
  }, [engine, playingTrackName, selectedTrack, trackVolume, loadSavedTrackVolume]);

  // Persist app icon
  useEffect(() => {
    const saved = localStorage.getItem("wizamp_appIcon");
    if (saved && icons[saved]) setAppIconName(saved);
    else if (allIconNames.length && !saved) setAppIconName(allIconNames[0]);
  }, []);

  useEffect(() => {
    localStorage.setItem("wizamp_appIcon", appIconName);
  }, [appIconName]);

  const scheduleSectionAtServerTime = (sectionName, serverMs) => {
    cancelScheduledCommands();
    scheduleAtServerTime(serverMs, () => {
      if (engine.getAudioState() !== 'running') {
        setAudioLocked(true);
        setPendingNetStart({ type: 'PLAY' });
        return;
      }
      engine.clearQueuedSection();
      engine.clearQueuedMode();
      engine.playSection(sectionName);
    });
  };

  function onTrackChosen(name) {
    // local select for snappy UI
    handleSelectTrack(name);

    // if online GM, announce to room so players mirror & preload
    if (room.onlineActive && isActiveRole) {
      room.requestSetTrack?.(name);
    }
  }

  return (
    <div style={{
      fontFamily: "sans-serif",
      padding: 20
      }}>

      <LeftPanel
        roomState={roomState}
        setRoomId={setRoomId}
        currentRoomId={roomId}
        role={role}
        setRole={setRole}
        displayName={displayName}
        setDisplayName={setDisplayName}
        room={room}
      />

      {/* Top-right controls: DB (left) + Settings (right) */}
      <div style={{ position: "absolute", top: 16, right: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {isActiveRole &&
            <button
              aria-label="Database"
              onClick={() => setDbOpen(true)}
              style={{
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                border: "none",
                fontSize: 20,
                cursor: "pointer",
              }}
              title="Database"
            >
              <Icon name="archive" size={20} />
            </button>
          }
          <button
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              fontSize: 20,
              cursor: "pointer",
            }}
            title="Settings"
          >
            <Icon name="settings" size={20} />
          </button>
        </div>
      </div>

      {audioLocked && room.onlineActive && (
        <div
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.5)",   // dark backdrop
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            zIndex: 9999
          }}
          onClick={handleEnableAudio} // optional: close modal when clicking backdrop
        >
          <div
            style={{
              background: "rgba(20,20,20,0.95)",
              color: "#fff",
              padding: "20px 24px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.15)",
              maxWidth: 400,
              width: "100%",
              boxShadow: "0 4px 16px rgba(0,0,0,0.3)"
            }}
            onClick={(e) => e.stopPropagation()} // prevent closing when clicking inside
          >
            <div style={{ fontWeight: 600, marginBottom: 12 }}>
              Audio is paused by the browser
            </div>
            <button
              onClick={handleEnableAudio}
              style={{
                cursor: "pointer",
                padding: "8px 14px",
                borderRadius: 6,
                border: "1px solid #aaa",
                background: "#1e90ff",
                color: "#fff",
              }}
            >
              Enable audio
            </button>
          </div>
        </div>
      )}

      <main style={{ width: "100%", maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column" }}>
      {/* Title with icon */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 0, marginBottom: 16 }}>
        <img
          src={icons[appIconName] || icons[allIconNames[0]]}
          alt="Wizamp icon"
          style={{ width: 64, height: 64, borderRadius: 6, objectFit: "cover" }}
        />
        <h1 style={{ margin: 0, color: "white" }}>Wizamp</h1>
      </div>

      {/* Track Controls */}
      <section style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
          {!isPassiveRole && (
            <TrackSelector
              tracks={tracks}
              value={selectedTrack}
              onChange={onTrackChosen}
              disabled={!isActiveRole && room.onlineActive}
              sortMode={dbSort}
              dynamicFirst={dbDynamicFirst}
              hideTests={dbHideTests}
              pinned={pinned}
              names={names}
            />
          )}
        </div>
      </section>

      {/* Now Playing (shows what's actually loaded/ready) */}
      {playingTrackName && (
        <div style={{ marginTop: -8, marginBottom: 12, display: "flex", justifyContent: "center", alignItems: "baseline", gap: 8, flexWrap: "wrap", textAlign: "center" }}>
          <span style={{ color: "#aaa", fontSize: 14, fontWeight: 400 }}>Track:</span>
          <span style={{ color: "#fff", fontSize: 20, fontWeight: 700 }}>
            {getTrackTitle(playingTrackName)}
          </span>

          {/* Track volume toggle */}
          {selectedTrack && !isPassiveRole && (
            <div style={{ position: "relative" }}>
              <button
                aria-label="Track volume"
                onClick={() => setTrackVolUIOpen(o => !o)}
                disabled={!isActiveRole}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "white",
                  borderRadius: 8,
                  width: 36, height: 36,                 // square 🔲
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: (!isActiveRole) ? "not-allowed" : "pointer",
                }}
                title="Track volume (set for all players)"
              >
                <Icon name={trackVolume === 1 ? "volume" : "volumeLow"} size={21} />
              </button>

              {trackVolUIOpen && (
                <div
                  style={{
                    position: "absolute", top: "110%", left: 0,
                    background: "#2a2a2a", color: "white", border: "1px solid #555", borderRadius: 8,
                    padding: 10, minWidth: 220, zIndex: 2
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 6 }}>Track volume (set for all players)</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 36, textAlign: "right", opacity: 0.9 }}>
                      {Math.round(trackVolume * 100)}
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(trackVolume * 100)}
                      onChange={(e) => {
                        const v = Number(e.target.value) / 100;
                        setTrackVolume(v);
                        // Always apply locally right away for zero-latency feedback
                        engine.setTrackVolume?.(v);
                        if (playingTrackName) {
                          if (room.onlineActive && isActiveRole) {
                            room.requestSetTrackVolume(v); // sync to others + snapshot
                          }
                        }
                      }}
                      style={{ flex: 1 }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Section Controls */}
      {currentSectionName && !isPassiveRole && (
        <section style={{ marginBottom: 16 }}>
          {isDynamicPlayingTrack && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap: 8, marginBottom: 8, textAlign: "center" }}>
              <span style={{ color: "#aaa", fontSize: 14, fontWeight: 400 }}>Section:</span>
              <span style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>
                {currentSectionName ? getSectionTitle(playingTrackName || selectedTrack, currentSectionName) : null}
              </span>
            </div>
          )}
          {!isPassiveRole && (
          <SectionPanel
            disabled={!isActiveRole && room.onlineActive}
            sections={sections}
            currentSectionName={currentSectionName}
            queuedSectionName={queuedSectionName}
            autoLockedTargets={autoLockedTargets}
            onToggleQueuedSection={(nameOrNull) => {
              setQueuedSectionName(nameOrNull);
              if (room.onlineActive && isActiveRole) {
                if (nameOrNull) room.requestQueueSection(nameOrNull);
                else room.requestClearSectionQueue();
              } else {
                if (nameOrNull) {

                  engine.queueSectionTransition?.(nameOrNull);
                } else {

                  engine.clearQueuedSection?.();
                }
              }
            }}
            largeButtons
            // NEW name resolvers
            getSectionTitle={(sectionKey) =>
              getSectionTitle(playingTrackName || selectedTrack, sectionKey)}
            getSectionButtonLabel={(sectionKey) =>
              getSectionButton(playingTrackName || selectedTrack, sectionKey)}
            getModeLabel={(sectionKey, modeNameOrBase) =>
              modeNameOrBase === "__base__"
                ? getBaseModeName(playingTrackName || selectedTrack, sectionKey)
                : getModeLabel(playingTrackName || selectedTrack, sectionKey, modeNameOrBase)}
            currentModeName={currentModeName}     // "base" or a mode name
            queuedModeName={queuedModeName}       // null or a mode name
            onToggleQueuedMode={(nameOrNull) => {
              setQueuedModeName(nameOrNull);
              if (room.onlineActive && isActiveRole) {
                if (nameOrNull) room.requestQueueMode(nameOrNull);
                else room.requestClearModeQueue();
              } else {
                if (nameOrNull) {

                  engine.queueModeTransition?.(nameOrNull);
                } else {

                  engine.clearQueuedMode?.();
                }
              }
            }}
          />
        )}
      </section>
      )}

      {/* Clip Information (progress bar from 0 to loopPoint) */}
      {!isPassiveRole && (
        <section style={{ marginBottom: 16 }}>
          <div style={{ height: 10, background: "#363119", borderRadius: 6, overflow: "hidden" }} aria-label="Clip position">
            <div style={{ width: `${Math.round(clipProgress * 100)}%`, height: "100%", background: "#E0C766", transition: "width 80ms linear" }} />
          </div>
        </section>
      )}

      {/* Transport Controls */}
      {!isPassiveRole && (
        <Transport
          disabled={!isActiveRole && room.onlineActive}
          isLoadingTrack={isLoadingTrack}
          isPlaying={isPlaying}
          isPaused={isPaused}
          onPlay={handlePlay}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
          autoplay={autoplay}
          setAutoplay={(fnOrBool) => {
            const next = typeof fnOrBool === "function" ? !!fnOrBool(autoplay) : !!fnOrBool;
            setAutoplay(next); // optimistic
            if (room.onlineActive && isActiveRole) {
              room.requestSetAutoplay?.(next);
            }
          }}
          isSimpleTrackPlaying={tracks[playingTrackName]?.simple === true}
          unlockAudio={() => engine.unlockAudio?.()}
        />
      )}
      </main>

      {autoStartRequestedFor && (
        <div style={{
          position: "fixed", left: 20, bottom: showStatus ? 64 : 20,
          background: "#2a2a2a", color: "white",
          border: "1px solid #555", borderRadius: 10,
          padding: "6px 10px", zIndex: 1
        }}>
          Autoplay pending… <span style={{ opacity: 0.8 }}>{autoStartRequestedFor}</span>
        </div>
      )}

      {/* Fixed bottom status bar (left), if enabled */}
      {showStatus && (
        <div style={{
          position: "fixed", left: 20, bottom: 20,
          background: "#2a2a2a", color: "white",
          border: "1px solid #555", borderRadius: 10,
          padding: "8px 12px", zIndex: 1, maxWidth: "40vw"
        }}>
          <StatusBar text={loading ? "Loading data…" : dataError || status} />
        </div>
      )}

      {/* Settings modal */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        fadeOutSeconds={fadeOutSeconds}
        setFadeOutSeconds={setFadeOutSeconds}
        pauseFadeSeconds={pauseFadeSeconds}
        setPauseFadeSeconds={setPauseFadeSeconds}
        showStatus={showStatus}
        setShowStatus={setShowStatus}
        appIconName={appIconName}
        setAppIconName={setAppIconName}
        allIconNames={allIconNames}
      />

      {/* Database modal */}
      <DatabaseModal
        open={dbOpen}
        onClose={() => setDbOpen(false)}
        tracks={tracks}
        sortMode={dbSort}
        dynamicFirst={dbDynamicFirst}
        hideTests={dbHideTests}
        onChangeSort={setDbSort}
        onChangeDynamicFirst={setDbDynamicFirst}
        onChangeHideTests={setDbHideTests}
        pinned={pinned}
        onTogglePin={togglePin}
        names={names}                 // NEW
        onApplyRename={(target, fields) => {   // NEW save handler
          setNames(prev => {
            const next = structuredClone(prev ?? {});
            if (target.type === "track") {
              next.tracks ||= {};
              next.tracks[target.trackName] ||= {};
              // store override or remove if equal to default
              const def = tracks?.[target.trackName]?.defaultDisplayName ?? target.trackName;
              if (!fields.name || fields.name === def) {
                if (next.tracks[target.trackName]) delete next.tracks[target.trackName].displayName;
              } else {
                next.tracks[target.trackName].displayName = fields.name;
              }
            } else if (target.type === "section") {
              next.sections ||= {};
              next.sections[target.trackName] ||= {};
              next.sections[target.trackName][target.sectionKey] ||= {};
              const defName = target.defaults?.nameDefault ?? target.sectionKey;
              const defButton = target.defaults?.buttonDefault ?? "";

              // displayName
              if (!fields.name || fields.name === defName) {
                delete next.sections[target.trackName][target.sectionKey].displayName;
              } else {
                next.sections[target.trackName][target.sectionKey].displayName = fields.name;
              }
              // buttonName
              const btn = fields.button ?? "";
              if (btn === defButton || btn === "") {
                delete next.sections[target.trackName][target.sectionKey].buttonName;
              } else {
                next.sections[target.trackName][target.sectionKey].buttonName = btn;
              }
            } else if (target.type === "mode") {
              if (target.isBase) {
                next.sections ||= {};
                next.sections[target.trackName] ||= {};
                next.sections[target.trackName][target.sectionKey] ||= {};
                const defBase = target.defaults?.nameDefault ?? "base";
                if (!fields.name || fields.name === defBase) {
                  delete next.sections[target.trackName][target.sectionKey].baseModeName;
                } else {
                  next.sections[target.trackName][target.sectionKey].baseModeName = fields.name;
                }
              } else {
                next.modes ||= {};
                next.modes[target.trackName] ||= {};
                next.modes[target.trackName][target.sectionKey] ||= {};
                next.modes[target.trackName][target.sectionKey][target.modeName] ||= {};
                const defMode = target.defaults?.nameDefault ?? target.modeName;
                if (!fields.name || fields.name === defMode) {
                  delete next.modes[target.trackName][target.sectionKey][target.modeName].displayName;
                } else {
                  next.modes[target.trackName][target.sectionKey][target.modeName].displayName = fields.name;
                }
              }
            }
            return next;
          });
        }}
      />

      {/* Per-user volume (local) */}
      <div
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          background: "#2a2a2a",
          color: "white",
          border: "1px solid #555",
          borderRadius: 10,
          padding: "8px 8px",
          zIndex: 1
        }}
        title="This affects only your device"
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 36, textAlign: "right", opacity: 0.9 }}>
            {Math.round(userVolume * 100)}
          </div>

          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(userVolume * 100)}
            onChange={(e) => setUserVolume(Number(e.target.value) / 100)}
            style={{
              width: 180,
              // grey-out while muted (still adjustable)
              filter: userMuted ? "grayscale(1)" : "none",
              opacity: userMuted ? 0.6 : 1
            }}
            aria-label="Your volume"
          />

          <button
            onClick={() => setUserMuted(m => !m)}
            aria-label={userMuted ? "Unmute" : "Mute"}
            title={userMuted ? "Unmute" : "Mute"}
            style={{
              width: 36,
              height: 36,
              background: "transparent",
              color: "white",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              opacity: userMuted ? 0.9 : 1
            }}
          >
            <Icon name={userMuted ? "volumeMute" : "volume"} size={21} />
          </button>
        </div>
      </div>
    </div>
  );
}
