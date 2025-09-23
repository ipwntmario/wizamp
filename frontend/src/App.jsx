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
import { net, ONLINE, setOnlineEnabledRuntime } from "./net/netController";
import { useRoom } from "./net/useRoom";
import TrackSelector from "./components/TrackSelector";
import SectionPanel from "./components/SectionPanel";
import StatusBar from "./components/StatusBar";
import DatabaseModal from "./components/DatabaseModal";
import SettingsModal from "./components/SettingsModal";
import UsersPanel from "./components/UsersPanel";
import Transport from "./components/Transport";

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
  const { tracks, loading } = useMusicData();  // <- only rely on tracks here
  const [clips, setClips] = useState({});
  const [sections, setSections] = useState({});

  const [appIconName, setAppIconName] = useState(() => allIconNames[0] ?? "");

  const [status, setStatus] = useState("Idle");
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [playingTrackName, setPlayingTrackName] = useState(null);
  const [isLoadingTrack, setIsLoadingTrack] = useState(false);

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
  const tracksRef = useRef({});
  const autoplayInFlightRef = useRef(false);

  // Mirrors of state for net callbacks
  const currentLoadIdRef = useRef(0);
  const readyForTrackRef = useRef(null); // which track we’ve marked ready

  // Autoplay setting (persist)
  const [autoplay, setAutoplay] = useState(() => {
    try { return localStorage.getItem("wizamp_autoplay") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("wizamp_autoplay", autoplay ? "1" : "0"); } catch {}
  }, [autoplay]);

  // Keep track of the last ended track for correct Autoplay functionality
  const lastEndedTrackRef = useRef(null);

  // If non-null, we will auto-start this track AFTER its preload finishes.
  const autoStartForRef = useRef(null);

  // Mirror the ref into state just so we can show a badge in the UI
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

  // Online (beta) – dark-launched via env + toggle
  const [onlineEnabled, setOnlineEnabled] = useState(() => {
    try { return localStorage.getItem("wizamp_onlineEnabled") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("wizamp_onlineEnabled", onlineEnabled ? "1" : "0"); } catch {}
    setOnlineEnabledRuntime(onlineEnabled);
  }, [onlineEnabled]);

  // Role & Display Name
  const [role, setRole] = useState(() => {
    try { return localStorage.getItem("wizamp_role") || "GM"; } catch { return "GM"; }
  });
  useEffect(() => { try { localStorage.setItem("wizamp_role", role); } catch {} }, [role]);

  // Role flags
  const normRole = role === "Player" ? "passive" : role; // map old to new
  const isGM = normRole === "GM";
  const isPassiveBTS = normRole === "passive-bts";
  const isPassive = normRole === "passive";

  const displayRoleLabel = isGM ? "active" : (isPassiveBTS ? "passive-bts" : "passive");
  const displayRoleIcon  = isGM ? "🎛️"     : (isPassiveBTS ? "👁️🎧"       : "🎧");

  const [displayName, setDisplayName] = useState(() => {
    try { return localStorage.getItem("wizamp_displayName") || ""; } catch { return ""; }
  });
  useEffect(() => { try { localStorage.setItem("wizamp_displayName", displayName); } catch {} }, [displayName]);

  // Modes
  const [currentModeName, setCurrentModeName] = useState("base");
  const [queuedModeName, setQueuedModeName] = useState(null);

  // Users panel
  const [usersOpen, setUsersOpen] = useState(false);

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

  const [playDisabled, setPlayDisabled] = useState(false);

  const [statusOpen, setStatusOpen] = useState(false);  // collapsible status
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
          setPlayDisabled(false);
          setClipProgress(0);

          const playing = playingTrackNameRef.current;
          const sel = selectedTrackRef.current;
          console.log("[STOP] was playing:", playing, "selected:", sel);
          lastEndedTrackRef.current = playing || null;
          setPlayingTrackName(null);

          // If Auto-Play is ON, and dropdown points to a *different* track,
          // request auto-start for that track (we will start AFTER preload completes).
          if (autoplayRef.current && sel && sel !== lastEndedTrackRef.current) {
            autoStartForRef.current = sel;
            setAutoStartRequestedFor(sel);
            console.log("[AUTOPLAY] requested for", sel);
          } else {
            console.log("[AUTOPLAY] not requested (autoplay:", autoplayRef.current,
                        "selected:", sel, "lastEnded:", lastEndedTrackRef.current, ")");
            autoStartForRef.current = null;
            setAutoStartRequestedFor(null);
          }
        }
      },

      onSectionChange: (name) => setCurrentSectionName(name ?? null),
      onQueueChange: (nameOrNull) => setQueuedSectionName(nameOrNull),
      onModeChange: (modeName) => setCurrentModeName(modeName || "base"),
      onModeQueueChange: (nameOrNull) => setQueuedModeName(nameOrNull),
      onReady: () => { setPlayDisabled(false); setClipProgress(0); },  // when engine finished resetting
      onPreloadComplete: async (trackName) => {
        console.log("[PRELOAD_COMPLETE] engine reports:", trackName,
                    "autoStartForRef:", autoStartForRef.current);
        // mark which track's assets are now loaded
        setPlayingTrackName(trackName);
        setClipProgress(0);
        setPlayDisabled(false);

        // If an auto-start was requested for this track, do it now
        if (autoStartForRef.current === trackName && !autoplayInFlightRef.current) {
          autoplayInFlightRef.current = true;
          console.log("[AUTOPLAY] all-local-ready barrier start for", trackName);
          await awaitAllClientsReady(trackName); // local no-op; future: wait for all clients
          const first = tracksRef.current?.[trackName]?.firstSection;
          console.log("[AUTOPLAY] barrier passed; first section:", first);
          if (first) engine.playSection(first);
          autoStartForRef.current = null; // consume the request
          setAutoStartRequestedFor(null);
          console.log("[AUTOPLAY] started and request consumed");
          autoplayInFlightRef.current = false;
        }

        // If we have a pending network-driven start for this track, honor it now.
        if (pendingPlayRef.current && pendingPlayRef.current.trackName === trackName) {
          // Ask GM for exact position (section/mode/clip/offset)
          console.log("[SYNC] requesting precise state from GM after preload");
          room?.requestSetAutoplay?.(autoplay); // benign; keeps UI aligned for joiner too
          // One-shot request:
          room?.requestSync?.(); // we'll define this below (or call ws directly via a helper)
          // We'll consume the reply in onSyncStateMsg
          return;
        }
      },
    });
  }
  const engine = engineRef.current;

  // Placeholder: in the future, replace this with a networked "all clients ready" await.
  // For now, it's immediate.
  const awaitAllClientsReady = async (trackName) => {
    // e.g., in MP mode you'd await a signal that all players preloaded 'trackName'
    return;
  };

  // Keep engine data in sync (optional safety when clips/sections set)
  useEffect(() => {
    engine.setData({ clips, sections, tracks });
  }, [engine, clips, sections, tracks]);

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
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);

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
  const isDynamicTrack = tracks[selectedTrack]?.simple === false;
  const isDynamicPlayingTrack = playingTrackName && tracks[playingTrackName]?.simple === false;


  // Handlers
  const handlePlay = async () => {
    if (isLoadingTrack) return;  // <-- early bail

    // If we’re idle or stopped and the selected track isn’t loaded, load it now
    const needLoad =
      !isPlaying &&
      selectedTrack &&
      (playingTrackName !== selectedTrack ||
        !sections || !Object.keys(sections).length ||
        !clips || !Object.keys(clips).length);

    if (needLoad) {
      await loadTrackAssets(selectedTrack); // serialized by isLoadingTrack
    }

    const target = currentSectionName || firstSection;
    if (target) {
      if (room.onlineActive && isGM) {
        // enforce ready gate by default
        if (!room.allReady) {
          // Show something lightweight to the GM; you can replace with your modal/toast
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

  const handlePlaySection = (sectionName) => {
    setQueuedSectionName(null);
    engine.clearQueuedSection?.();
    engine.clearQueuedMode?.();
    net.playSection(sectionName);
    engine.playSection(sectionName);
  };

  const handlePause = () => {
    const simple = !!tracks[playingTrackName || selectedTrack]?.simple;
    if (room.onlineActive && isGM) {
      room.requestPause();
    } else {
      net.pause(simple); engine.pause(simple);
    }
  };

  const handleResume = () => {
    const simple = !!tracks[playingTrackName || selectedTrack]?.simple;
    if (room.onlineActive && isGM) {
      room.requestResume({ delayMs: 1000 }); // small lead time like Play
    } else {
      net.resume(simple); engine.resume(simple);
    }
  };

  const handleStop = async () => {
    setPlayDisabled(true);

    if (room.onlineActive && isGM) {
      // Tell everyone to stop (with fade)
      room.requestStop(true);
    } else {
      // Local stop only
      net.stop(true);
      // Use the same method you already had for fading out
      if (engine.stopTrack) {
        engine.stopTrack(true);
      } else {
        engine.stop(true);
      }
    }
  };


  const loadSavedTrackVolume = (name) => {
    try {
      const k = `wizamp:trackVolume:${name}`;
      const v = localStorage.getItem(k);
      const num = v == null ? 1 : Math.max(0, Math.min(1, Number(v)));
      return Number.isFinite(num) ? num : 1;
    } catch { return 1; }
  };

  const saveTrackVolume = (name, vol) => {
    try {
      const k = `wizamp:trackVolume:${name}`;
      localStorage.setItem(k, String(vol));
    } catch {}
  };

  const handleSelectTrack = async (name) => {
    console.log("[SELECT_TRACK]", name, "isPlaying:", isPlaying,
                "playingTrackName:", playingTrackName);
    // Only update selection + volume now; actual loading is deferred until STOP.
    setSelectedTrack(name);
    const savedVol = loadSavedTrackVolume(name);
    setTrackVolume(savedVol);
    // Mirror to net (no-op until online is on)
    net.setTrack(name);
  };

  const onSetTrack = useCallback((name, seed) => {
    console.log("[APP] onSetTrack", { name, seed });
    // Always apply the seed (GM and players)
    if (seed != null) {
      console.log("[APP] engine.setRandomSeed(seed) (apply even if already selected)");
      try { engine.setRandomSeed?.(seed >>> 0); } catch (e) { console.warn("engine.setRandomSeed failed", e); }
    }
    // Only trigger local selection if it changed
    if (selectedTrack !== name) {
      handleSelectTrack(name);
    }
  }, [selectedTrack, handleSelectTrack]);

  // Helper: load assets for a given track (called when fully stopped)
  const loadTrackAssets = async (name) => {
    if (!name) return;
    if (isPlaying) return;          // never load mid-play
    if (isLoadingTrack) return;     // already loading

    setIsLoadingTrack(true);
    try {
      console.log("[LOAD] begin", name);
      const basePath = tracks[name]?.basePath || `/tracks/${name}`;
      const [clipRes, sectRes] = await Promise.all([
        fetch(`${basePath}/clipData.json`),
        fetch(`${basePath}/sectionData.json`)
      ]);
      console.log("[LOAD] fetched JSON for", name, "basePath:", basePath);
      const clipJson = await clipRes.json();
      const sectJson = await sectRes.json();
      const nextClips    = clipJson?.clips    || clipJson || {};
      const nextSections = sectJson?.sections || sectJson || {};

      setClips(nextClips);
      setSections(nextSections);
      engine.setData({ clips: nextClips, sections: nextSections, tracks });

      const savedVol = loadSavedTrackVolume(name);
      console.log("[LOAD] calling engine.preloadTrack", name, "vol:", savedVol);
      const loadId = Date.now();
      currentLoadIdRef.current = loadId;
      try {
        // Only clear ready if we’re switching to a different track
        if (readyForTrackRef.current !== name) {
          room.setReady(false);
        }
      } catch {}

      await engine.preloadTrack(name, { trackVolume: savedVol, basePath });

      setPlayingTrackName(name); // reflect what's actually loaded/ready
      setClipProgress(0); // start progress at 0 for newly loaded track

      console.log("[LOAD] completed preload for", name,
                  "autoStartForRef:", autoStartForRef.current);
      try {
        if (currentLoadIdRef.current === loadId) {
          room.setReady(true);
          readyForTrackRef.current = name; // remember which track is ready
        }
      } catch {}

      // If this preload was requested for auto-start, do it now
      if (autoStartForRef.current === name) {
        console.log("[AUTOPLAY] (redundant path) awaiting barrier for", name);
        await awaitAllClientsReady(name); // local no-op; future: wait for all clients
        const first = tracks[name]?.firstSection;
        if (first) {
          console.log("[AUTOPLAY] (redundant path) starting first section:", first);
          engine.playSection(first);
        }
        autoStartForRef.current = null; // consume the request
      }
    } finally {
      setIsLoadingTrack(false);
      console.log("[LOAD] end", name);
    }
  };

  const onPauseMsg = useCallback(() => {
    const simple = !!tracks[playingTrackName || selectedTrack]?.simple;
    net.pause(simple);
    engine.pause(simple);
  }, [tracks, playingTrackName, selectedTrack, net, engine]);

  const onStopMsg = useCallback((fade = true) => {
    // Keep UI behavior consistent with local handleStop:
    setPlayDisabled?.(true);
    // Your net layer's existing stop (use the signature you already use locally)
    try { net.stop?.(true); } catch {}
    // Fade the engine out; engine.stopTrack handles the fade
    if (engine.stopTrack) engine.stopTrack(fade);
  }, [setPlayDisabled, net, engine]);

  const onResumeMsg = useCallback((serverMs) => {
    const simple = !!tracks[playingTrackName || selectedTrack]?.simple;
    scheduleAtServerTime(serverMs, () => {
      net.resume(simple);
      engine.resume(simple);
    });
  }, [tracks, playingTrackName, selectedTrack, net, engine]);

  const onQueueSectionMsg = useCallback((name) => {
    setQueuedSectionName(name || null);
    if (name) engine.queueSectionTransition?.(name);
  }, [engine]);

  const onClearSectionQueueMsg = useCallback(() => {
    setQueuedSectionName(null);
    engine.clearQueuedSection?.();
  }, [engine]);

  const onQueueModeMsg = useCallback((name) => {
    setQueuedModeName(name || null);
    if (name) engine.queueModeTransition?.(name);
  }, [engine]);

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

    const state = {
      ...snapshot,                // {trackName, sectionName, modeName, clipName, offsetSeconds, seed}
      volume: trackVolume ?? 1,   // include current room volume
      rngDrawCount: engine.getRngDrawCount?.() ?? snapshot.rngDrawCount ?? 0,
    };

    // Use the ref (may still be null on first render; that’s OK)
    sendSyncResponseRef.current?.(requesterId, state);
  }, [engine, trackVolume]);

  const onSyncStateMsg = useCallback((state) => {
    if (!state) return;
    const { trackName, sectionName, modeName, clipName, offsetSeconds, seed, volume } = state;

    // Ensure we’re on the right track (should already be selected/preloaded)
    if (trackName && trackName !== selectedTrack) handleSelectTrack(trackName);

    // 1) Seed + fast-forward RNG to GM’s draw count BEFORE any transitions
    if (seed != null) engine.setRandomSeed?.(seed >>> 0);
    const draws = Number(state?.rngDrawCount ?? 0) | 0;
    if (draws > 0) engine.fastForwardRng?.(draws);

    // 2) Apply volume for good measure
    if (typeof volume === "number") {
      setTrackVolume(volume);
      engine.setTrackVolume?.(volume);
    }

    // 3) Jump precisely to the reported musical position
    engine.clearQueuedSection?.();
    engine.clearQueuedMode?.();
    engine.playAtPosition?.({ sectionName, modeName, clipName, offsetSeconds, warmStartDeltaSec: 0.5 });

    pendingPlayRef.current = null;
  }, [engine, selectedTrack, handleSelectTrack, setTrackVolume]);

  // // Joiner asks GM for an exact position once ready:
  // const sendSyncRequest = useCallback(() => {
  //   // we’ll send via useRoom by exposing a simple method; or directly:
  //   try {
  //     // useRoom exposes no-arg wrapper here:
  //     room?.requestSync?.();
  //   } catch {}
  // }, [room]);

  const room = useRoom({
    onlineEnabled,
    displayName,
    role,
    onSetTrack,
    onPlay: ({ trackName, sectionName, serverMs }) => {
      // Late-join friendliness:
      // 1) If assets not ready, ensure selection + preload first.
      // 2) After preload, schedule at max(serverMs, serverNow + 1500ms) so everyone lines up.
      const needPreload = !playingTrackName || playingTrackName !== trackName;
      // Snap the UI track selector if needed (no load yet)
      if (trackName && trackName !== selectedTrack) handleSelectTrack(trackName);
      if (!sectionName || !serverMs) return;
      if (needPreload || isLoadingTrack) {
        pendingPlayRef.current = { trackName, sectionName, serverMs };
        // kick off preload if not already happening
        if (!isLoadingTrack && selectedTrack === trackName) {
          // If we’re fully stopped, your effect will call loadTrackAssets(selectedTrack)
          // If we’re not stopped yet, we can force load here as a safety:
          if (!isPlaying) loadTrackAssets(trackName);
        }
      } else {
        // We are ready: schedule with a safety lead time if serverMs already passed
        const now = room.serverNowMs ? room.serverNowMs() : Date.now();
        const target = Math.max(serverMs, now + 1500);
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
  // room = { onlineActive, connected, users, roomId, setReady }

  useEffect(() => {
    sendSyncResponseRef.current = room.sendSyncResponse;
    return () => { sendSyncResponseRef.current = null; };
  }, [room.sendSyncResponse]);

  // When fully stopped (end of fade or true end), load whichever track is selected.
  useEffect(() => {
    if (!isPlaying && selectedTrack && (!playingTrackName || selectedTrack !== playingTrackName)) {
      console.log("[EFFECT loadTrackAssets] trigger",
                  "isPlaying:", isPlaying, "selectedTrack:", selectedTrack,
                  "playingTrackName:", playingTrackName);
      loadTrackAssets(selectedTrack);
    }
  }, [isPlaying, selectedTrack, playingTrackName]);  // will only run after a real STOP

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
  }, [engine, playingTrackName, selectedTrack, trackVolume]);

  // Persist app icon
  useEffect(() => {
    const saved = localStorage.getItem("wizamp_appIcon");
    if (saved && icons[saved]) setAppIconName(saved);
    else if (allIconNames.length && !saved) setAppIconName(allIconNames[0]);
  }, []);

  useEffect(() => {
    localStorage.setItem("wizamp_appIcon", appIconName);
  }, [appIconName]);

  const scheduleAtServerTime = (serverMs, fn) => {
    try {
      const now = room.serverNowMs ? room.serverNowMs() : Date.now();
      const delay = Math.max(0, serverMs - now);
      setTimeout(fn, delay);
    } catch {
      fn();
    }
  };

  // helper: schedule a section at a server timestamp
  const scheduleSectionAtServerTime = (sectionName, serverMs) => {
    try {
      const ctx = engine.ensureContext ? engine.ensureContext() : engine.audioCtx;
      const audioNow = ctx?.currentTime ?? 0;
      const serverNow = room.serverNowMs ? room.serverNowMs() : Date.now();
      const deltaSec = Math.max(0, (serverMs - serverNow) / 1000);
      // Nudge a tiny safety margin for timers (20ms)
      const delayMs = Math.max(0, (deltaSec - 0.02) * 1000);
      setTimeout(() => {
        engine.clearQueuedSection?.();
        engine.clearQueuedMode?.();
        engine.playSection(sectionName);
      }, delayMs);
    } catch (e) {
      console.error("scheduleSectionAtServerTime failed", e);
      // fallback: just play immediately
      engine.playSection(sectionName);
    }
  };

  function onTrackChosen(name) {
    // local select for snappy UI
    handleSelectTrack(name);

    // if online GM, announce to room so players mirror & preload
    if (room.onlineActive && isGM) {
      room.requestSetTrack?.(name);
    }
  }

  return (
    <div style={{
      fontFamily: "sans-serif",
      padding: 20
      }}>

      {/* Top-right controls: DB (left) + Settings (right) */}
      <div style={{ position: "absolute", top: 16, right: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <span
            title={`You are ${displayRoleLabel}`}
            style={{
              marginRight: 8,
              padding: "4px 8px",
              borderRadius: 999,
              fontSize: 12,
              background: "rgba(0,0,0,0.5)",
              color: "#fff",
              opacity: room.onlineActive ? 1 : 0.6,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>{displayRoleIcon}</span>
            <span style={{ fontWeight: 600 }}>{displayRoleLabel}</span>
          </span>
          {room.onlineActive && (
            <button
              aria-label="Users"
              onClick={() => setUsersOpen(v => !v)}
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
            title="Users"
            >
              👥
            </button>
          )}
          {isGM &&
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
              🗄️
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
            ⚙️
          </button>
        </div>

        {/* UsersPanel anchored under this row */}
        <UsersPanel
          onlineActive={room.onlineActive}
          connected={room.connected}
          roomId={room.roomId}
          users={room.users}
          visible={usersOpen}
          latencyMs={room.latencyMs}
          offsetMs={room.offsetMs}
          allReady={room.allReady}
          lastError={room.lastError}
        />
      </div>

      {/* Title with icon */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 0, marginBottom: 16 }}>
        <img
          src={icons[appIconName] || icons[allIconNames[0]]}
          alt="Wizamp icon"
          style={{ width: 64, height: 64, borderRadius: 6, objectFit: "cover" }}
        />
        <h1 style={{ margin: 0, color: "white" }}>Wizamp</h1>
      </div>

      {/* Track Controls */}
      <section style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {!isPassive && (
            <TrackSelector
              tracks={tracks}
              value={selectedTrack}
              onChange={onTrackChosen}
              disabled={!isGM && room.onlineActive}
              sortMode={dbSort}
              dynamicFirst={dbDynamicFirst}
              hideTests={dbHideTests}
              pinned={pinned}
              names={names}                 // NEW
            />
          )}
        </div>
      </section>

      {/* Now Playing (shows what's actually loaded/ready) */}
      {playingTrackName && (
        <div style={{ marginTop: -8, marginBottom: 12, display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ color: "#aaa", fontSize: 14, fontWeight: 400 }}>Track:</span>
          <span style={{ color: "#fff", fontSize: 20, fontWeight: 700 }}>
            {getTrackTitle(playingTrackName)}
          </span>

          {/* 🔊 Track volume toggle */}
          {selectedTrack && !isPassive && (
            <div style={{ position: "relative" }}>
              <button
                aria-label="Track volume"
                onClick={() => setTrackVolUIOpen(o => !o)}
                disabled={!isGM}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "white",
                  borderRadius: 8,
                  width: 36, height: 36,                 // square 🔲
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: (!isGM) ? "not-allowed" : "pointer",
                }}
                title="Track volume (set for all players)"
              >
                {trackVolume === 1
                  ? "🔊"
                  : "🔈"
                }
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
                          if (room.onlineActive && isGM) {
                            room.requestSetTrackVolume(v); // sync to others + snapshot
                          } else {
                            net.setTrackVolume?.(playingTrackName, v);
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
      {currentSectionName && !isPassive && (
        <section style={{ marginBottom: 16 }}>
          {isDynamicPlayingTrack && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
              <span style={{ color: "#aaa", fontSize: 14, fontWeight: 400 }}>Section:</span>
              <span style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>
                {currentSectionName ? getSectionTitle(playingTrackName || selectedTrack, currentSectionName) : null}
              </span>
            </div>
          )}
          {!isPassive && (
          <SectionPanel
            disabled={!isGM && room.onlineActive}
            sections={sections}
            currentSectionName={currentSectionName}
            queuedSectionName={queuedSectionName}
            autoLockedTargets={autoLockedTargets}
            onToggleQueuedSection={(nameOrNull) => {
              setQueuedSectionName(nameOrNull);
              if (room.onlineActive && isGM) {
                if (nameOrNull) room.requestQueueSection(nameOrNull);
                else room.requestClearSectionQueue();
              } else {
                if (nameOrNull) {
                  net.queueSection?.(nameOrNull);
                  engine.queueSectionTransition?.(nameOrNull);
                } else {
                  net.clearQueuedSection?.();
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
              if (room.onlineActive && isGM) {
                if (nameOrNull) room.requestQueueMode(nameOrNull);
                else room.requestClearModeQueue();
              } else {
                if (nameOrNull) {
                  net.queueMode?.(nameOrNull);
                  engine.queueModeTransition?.(nameOrNull);
                } else {
                  net.clearQueuedMode?.();
                  engine.clearQueuedMode?.();
                }
              }
            }}
          />
        )}
      </section>
      )}

      {/* Clip Information (progress bar from 0 to loopPoint) */}
      {!isPassive && (
        <section style={{ marginBottom: 16 }}>
          <div style={{ height: 10, background: "#363119", borderRadius: 6, overflow: "hidden" }} aria-label="Clip position">
            <div style={{ width: `${Math.round(clipProgress * 100)}%`, height: "100%", background: "#E0C766", transition: "width 80ms linear" }} />
          </div>
        </section>
      )}

      {/* Transport Controls */}
      {!isPassive && (
        <Transport
          disabled={!isGM && room.onlineActive}
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
            if (room.onlineActive && isGM) {
              room.requestSetAutoplay?.(next);
            }
          }}
          isSimpleTrackPlaying={tracks[playingTrackName]?.simple === true}
        />
      )}

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
          <StatusBar text={loading ? "Loading data…" : status} />
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
        onlineEnabled={onlineEnabled && ONLINE}   // gated by env + user toggle
        setOnlineEnabled={(v) => setOnlineEnabled(v)}
        role={role}
        setRole={setRole}
        displayName={displayName}
        setDisplayName={setDisplayName}
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
              const s = /* original section obj */ (() => {
                // Sections live per-track; in DB modal we fetch sectionData by track
                // but app also has a master 'sections' map; for defaults use DB modal-provided fields
                return null; // we’ll rely on defaults passed in fields.defaults
              })();

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
            {userMuted ? "🔇" : "🔊"}
          </button>
        </div>
      </div>
    </div>
  );
}