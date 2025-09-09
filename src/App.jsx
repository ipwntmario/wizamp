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

import { useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "./audio/audioEngine";
import { useMusicData } from "./data/useMusicData";
import TrackSelector from "./components/TrackSelector";
import SectionPanel from "./components/SectionPanel";
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

  // Mirrors of state for engine callbacks (avoid stale closures)
  const selectedTrackRef = useRef(null);
  const playingTrackNameRef = useRef(null);
  const autoplayRef = useRef(false);
  const tracksRef = useRef({});
  const autoplayInFlightRef = useRef(false);

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

  // Status visibility (persist)
  const [showStatus, setShowStatus] = useState(() => {
    try { return localStorage.getItem("wizamp_showStatus") !== "0"; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem("wizamp_showStatus", showStatus ? "1" : "0"); } catch {}
  }, [showStatus]);

  // Modes
  const [currentModeName, setCurrentModeName] = useState("base");
  const [queuedModeName, setQueuedModeName] = useState(null);

  // Setings menu
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fadeOutSeconds, setFadeOutSeconds] = useState(6); // default 4

  const [playDisabled, setPlayDisabled] = useState(false);

  const [statusOpen, setStatusOpen] = useState(false);  // collapsible status
  const [clipProgress, setClipProgress] = useState(0);  // 0..1 visual bar

  // Volume settings
  const [trackVolUIOpen, setTrackVolUIOpen] = useState(false);
  const [trackVolume, setTrackVolume] = useState(1); // 0..1
  const [userVolume, setUserVolume] = useState(1);   // 0..1 (local)
  const [userMuted, setUserMuted] = useState(false);

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

  // Keep refs in sync
  useEffect(() => { selectedTrackRef.current = selectedTrack; }, [selectedTrack]);
  useEffect(() => { playingTrackNameRef.current = playingTrackName; }, [playingTrackName]);
  useEffect(() => { autoplayRef.current = autoplay; }, [autoplay]);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);


  // When a track is selected, point UI at its first section
  useEffect(() => {
    if (isPlaying) return;        // ← don’t switch UI mid-play
    if (!selectedTrack) {
      setCurrentSectionName(null);
      setQueuedSectionName(null);
      return;
    }
    const first = tracks[selectedTrack]?.firstSection || null;
    setCurrentSectionName(first);
    setQueuedSectionName(null);
  }, [selectedTrack, tracks, isPlaying]);

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
      setClipProgress(info?.progress01 ?? 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  // derive if not "simple" track
  const isDynamicTrack = tracks[selectedTrack]?.simple === false;
  const isDynamicPlayingTrack = playingTrackName && tracks[playingTrackName]?.simple === false;


  // Handlers
  const handlePlay = async () => {
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
      engine.playSection(target);
    }
  };

  const handlePlaySection = (sectionName) => {
    setQueuedSectionName(null);
    engine.clearQueuedSection?.();
    engine.clearQueuedMode?.();
    engine.playSection(sectionName);
  };

  const handleStop = async () => {
    // Fade out current audio; do NOT reload any track here.
    setPlayDisabled(true);
    engine.stopTrack?.(true); // "Stopped" will arrive after fade; onStatus will re-enable
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
    // No preload here by design.
  };

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
      await engine.preloadTrack(name, { trackVolume: savedVol, basePath });

      setPlayingTrackName(name); // reflect what's actually loaded/ready
      setClipProgress(0); // start progress at 0 for newly loaded track

      console.log("[LOAD] completed preload for", name,
                  "autoStartForRef:", autoStartForRef.current);
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

  return (
    <div style={{
      fontFamily: "sans-serif",
      padding: 20
      }}>

      {/* Settings Icon */}
      <div style={{ position: "absolute", top: 16, right: 16 }}>
        <button
          aria-label="Settings"
          onClick={() => setSettingsOpen(true)}
          style={{
            background: "transparent",
            border: "none",
            fontSize: 22,
            cursor: "pointer",
          }}
          title="Settings"
        >
          ⚙️
        </button>
      </div>

      {/* Title with icon */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 0, marginBottom: 16 }}>
        <img
          src={icons[appIconName] || icons[allIconNames[0]]}
          alt="Wizamp icon"
          style={{ width: 64, height: 64, borderRadius: 6, objectFit: "cover" }}
        />
        <h1 style={{ margin: 0 }}>Wizamp</h1>
      </div>

      {/* Track Controls */}
      <section style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <TrackSelector
            tracks={tracks}
            value={selectedTrack}
            onChange={handleSelectTrack}
          />

          {/* 🔊 Track volume toggle */}
          {selectedTrack && (
            <div style={{ position: "relative" }}>
              <button
                aria-label="Track volume"
                onClick={() => setTrackVolUIOpen(o => !o)}
                style={{
                  background: "transparent",
                  border: "1px solid #555",
                  color: "white",
                  borderRadius: 8,
                  width: 36, height: 36,                 // square 🔲
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer"
                }}
                title="Track volume (set for all players)"
              >
                🔊
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
                      onChange={(e) => setTrackVolume(Number(e.target.value) / 100)}
                      style={{ flex: 1 }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Now Playing (shows what's actually loaded/ready) */}
      {playingTrackName && (
        <div style={{ marginTop: -8, marginBottom: 12, display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ color: "#aaa", fontSize: 16, fontWeight: 600 }}>Track:</span>
          <span style={{ color: "#fff", fontSize: 20, fontWeight: 700 }}>
            {tracks[playingTrackName]?.defaultDisplayName || playingTrackName}
          </span>
        </div>
      )}

      {/* Section Controls */}
      {currentSectionName && (
        <section style={{ marginBottom: 16 }}>
          {isDynamicPlayingTrack && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
              <span style={{ color: "#aaa", fontSize: 14, fontWeight: 600 }}>Section:</span>
              <span style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>
                {sections[currentSectionName]?.defaultDisplayName ?? currentSectionName}
              </span>
            </div>
          )}
          <SectionPanel
            sections={sections}
            currentSectionName={currentSectionName}
            queuedSectionName={queuedSectionName}
            autoLockedTargets={autoLockedTargets}
            // Modes:
            currentModeName={currentModeName}
            queuedModeName={queuedModeName}
            onToggleQueuedMode={(modeOrNull) => {
              if (modeOrNull) engine.queueModeTransition?.(modeOrNull);
              else engine.clearQueuedMode?.();
            }}
            // base mode display name override (label)
            getBaseModeLabel={(sectionName) =>
              sections[sectionName]?.defaultBaseModeName || "base"
            }
            onToggleQueuedSection={(nameOrNull) => {
              setQueuedSectionName(nameOrNull);
              if (nameOrNull) engine.queueSectionTransition(nameOrNull);
              else engine.clearQueuedSection();
            }}
            largeButtons
          />
      </section>
      )}

      {/* Clip Information (progress bar from 0 to loopPoint) */}
      <section style={{ marginBottom: 16 }}>
        <div style={{ height: 10, background: "#444", borderRadius: 6, overflow: "hidden" }} aria-label="Clip position">
          <div style={{ width: `${Math.round(clipProgress * 100)}%`, height: "100%", background: "#dac189", transition: "width 80ms linear" }} />
        </div>
      </section>

      {/* Control Row: Auto-Play • Play/Pause • Stop */}
      <section style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Auto-Play toggle (smaller circle) */}
          <button
            onClick={() => setAutoplay(a => !a)}
            title={autoplay ? "Auto-Play is ON (↠)" : "Auto-Play is OFF (⇥)"}
            aria-pressed={autoplay}
            style={{
              width: 36, height: 36, borderRadius: "50%",
              border: "1px solid #555", background: autoplay ? "#2f6b76" : "transparent",
              color: "white", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center"
            }}
          >
            {autoplay ? "↠" : "⇥"}
          </button>

          {/* Play/Pause (largest circle) */}
          <button
            onClick={() => { if (!isPlaying) handlePlay(); /* pause TBD */ }}
            disabled={playDisabled}
            title={isPlaying ? "Pause (coming soon)" : "Play"}
            style={{
              width: 52, height: 52, borderRadius: "50%",
              border: "1px solid #555",
              background: isPlaying ? "#000" : "#0aa",
              color: isPlaying ? "white" : "black",
              fontSize: 18,
              cursor: playDisabled ? "not-allowed" : "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
            >
              {isPlaying ? "⏸" : "⏵"}
            </button>

            {/* Stop (always visible; black by default, red if a SIMPLE track is playing) */}
            <button
              onClick={() => { if (isPlaying) handleStop(); }}
              title="Stop"
              style={{
                width: 40, height: 40, borderRadius: "50%",
                border: "1px solid #555",
                background: (isPlaying && tracks[playingTrackName]?.simple === true) ? "#ad2f49" : "#000",
                color: "white",
                cursor: isPlaying ? "pointer" : "default",
                display: "inline-flex", alignItems: "center", justifyContent: "center"
              }}
              >
                ⏹
              </button>
        </div>
      </section>

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
      {settingsOpen && (
        <div
          onClick={() => setSettingsOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 360, background: "#2d2d2d", color: "white", borderRadius: 12, padding: 16, boxShadow: "0 10px 30px rgba(0,0,0,0.25)" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Settings</h2>
              <button onClick={() => setSettingsOpen(false)} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "white" }} aria-label="Close">✕</button>
            </div>

            <div style={{ marginTop: 16 }}>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                Fade-out on Stop
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="number" min={0} max={30} step={0.1}
                  value={fadeOutSeconds}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) {
                      const clamped = Math.max(0, Math.min(30, v));
                      setFadeOutSeconds(clamped);
                    }
                  }}
                  style={{ width: 90, padding: "6px 8px" }}
                />
                <span>seconds of fade-out when Stop is pressed</span>
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: "#bbb" }}>(0 = instantaneous, max 30s)</div>
            </div>

            <div style={{ marginTop: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={showStatus}
                  onChange={(e) => setShowStatus(e.target.checked)}
                  />
                  <span>Show status bar</span>
              </label>
            </div>

            <div>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span>App icon:</span>
                <select
                  value={appIconName}
                  onChange={(e) => setAppIconName(e.target.value)}
                  style={{ padding: "4px", borderRadius: 6 }}
                >
                  {allIconNames.map((file) => (
                    <option key={file} value={file}>
                      {file}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>
      )}

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