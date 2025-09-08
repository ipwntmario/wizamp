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
import Transport from "./components/Transport";
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
      onStatus: (s) => {
        setStatus(s);
        if (s === "Stopped") {
          setPlayDisabled(false);
          setClipProgress(0);
          setPlayingTrackName(null);  // force post-stop reload
        }
      },
      onSectionChange: (name) => setCurrentSectionName(name ?? null),
      onQueueChange: (nameOrNull) => setQueuedSectionName(nameOrNull),
      onModeChange: (modeName) => setCurrentModeName(modeName || "base"),
      onModeQueueChange: (nameOrNull) => setQueuedModeName(nameOrNull),
      onReady: () => { setPlayDisabled(false); setClipProgress(0); },  // when engine finished resetting
    });
  }
  const engine = engineRef.current;

  // Keep engine data in sync (optional safety when clips/sections set)
  useEffect(() => {
    engine.setData({ clips, sections, tracks });
  }, [engine, clips, sections, tracks]);

  // Keep engine fade setting in sync
  useEffect(() => {
    engine.setFadeOutSeconds?.(fadeOutSeconds);
  }, [engine, fadeOutSeconds]);

  // When a track is selected, point UI at its first section
  useEffect(() => {
    if (!selectedTrack) {
      setCurrentSectionName(null);
      setQueuedSectionName(null);
      return;
    }
    const first = tracks[selectedTrack]?.firstSection || null;
    setCurrentSectionName(first);
    setQueuedSectionName(null);
  }, [selectedTrack, tracks]);

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


  // derive playing state
  const isPlaying = /^Playing/.test(status);

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
      const basePath = tracks[name]?.basePath || `/tracks/${name}`;
      const [clipRes, sectRes] = await Promise.all([
        fetch(`${basePath}/clipData.json`),
        fetch(`${basePath}/sectionData.json`)
      ]);
      const clipJson = await clipRes.json();
      const sectJson = await sectRes.json();
      const nextClips    = clipJson?.clips    || clipJson || {};
      const nextSections = sectJson?.sections || sectJson || {};

      setClips(nextClips);
      setSections(nextSections);
      engine.setData({ clips: nextClips, sections: nextSections, tracks });

      const savedVol = loadSavedTrackVolume(name);
      await engine.preloadTrack(name, { trackVolume: savedVol, basePath });

      setPlayingTrackName(name); // reflect what's actually loaded/ready
      setClipProgress(0); // start progress at 0 for newly loaded track
      } finally {
        setIsLoadingTrack(false);
      }
  };

  // When fully stopped (end of fade or true end), load whichever track is selected.
  useEffect(() => {
    if (!isPlaying && selectedTrack && (!playingTrackName || selectedTrack !== playingTrackName)) {
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

          {selectedTrack && (
            <Transport
              isPlaying={isPlaying}
              onPlay={handlePlay}
              onStop={handleStop}
              playDisabled={playDisabled}
              controlSize={36}                                   // match 🔊 height
              stopStyle={isDynamicPlayingTrack ? { background: "transparent" } : undefined}
            />
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

      {/* Status (collapsible) */}
      <section>
        <button
          onClick={() => setStatusOpen(s => !s)}
          style={{ background: "transparent", color: "white", border: "1px solid #555", borderRadius: 6, padding: "4px 10px", cursor: "pointer", marginBottom: 8 }}
          aria-label={statusOpen ? "Collapse" : "Expand"}
          title={statusOpen ? "Collapse" : "Expand"}
        >
          {statusOpen ? "−" : "+"}
        </button>
        {statusOpen && (
          <div>
            <StatusBar text={loading ? "Loading data…" : status} />
          </div>
        )}
      </section>

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