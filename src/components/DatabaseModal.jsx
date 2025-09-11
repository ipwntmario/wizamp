// src/components/DatabaseModal.jsx
import { useEffect, useMemo, useState } from "react";

export default function DatabaseModal({
  open,
  onClose,
  tracks,                       // { [trackName]: { defaultDisplayName, basePath, simple, ... } }
}) {
  const [expandedTracks, setExpandedTracks] = useState(() => new Set());
  const [expandedSections, setExpandedSections] = useState(() => new Set()); // keys: `${track}::${sectionKey}`
  const [sectionsByTrack, setSectionsByTrack] = useState({});               // cache: { trackName: { sections } }
  const [loadingTrack, setLoadingTrack] = useState(null);

  // helper: toggle track row
  const toggleTrack = async (trackName) => {
    const next = new Set(expandedTracks);
    if (next.has(trackName)) {
      next.delete(trackName);
      setExpandedTracks(next);
      return;
    }
    // expanding — ensure we have sectionData cached
    if (!sectionsByTrack[trackName]) {
      setLoadingTrack(trackName);
      try {
        const basePath = tracks[trackName]?.basePath || `/tracks/${trackName}`;
        const res = await fetch(`${basePath}/sectionData.json`);
        const json = await res.json();
        const sections = json?.sections || json || {};
        setSectionsByTrack((prev) => ({ ...prev, [trackName]: sections }));
      } catch (e) {
        console.error("Failed to load sectionData for", trackName, e);
      } finally {
        setLoadingTrack(null);
      }
    }
    next.add(trackName);
    setExpandedTracks(next);
  };

  const toggleSection = (trackName, sectionKey) => {
    const key = `${trackName}::${sectionKey}`;
    const next = new Set(expandedSections);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedSections(next);
  };

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 9999
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 640, maxHeight: "80vh", overflow: "auto",
          background: "#2d2d2d", color: "white",
          borderRadius: 12, padding: 16, boxShadow: "0 10px 30px rgba(0,0,0,0.25)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Database</h2>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "white" }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Table-ish list */}
        <div style={{ marginTop: 12 }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "24px 1fr", padding: "6px 8px", borderBottom: "1px solid #444", color: "#bbb" }}>
            <div />
            <div>Name</div>
          </div>

          {/* Rows */}
          <div>
            {Object.entries(tracks).map(([trackName, t]) => {
              const isExpanded = expandedTracks.has(trackName);
              const isDynamic = t?.simple === false;
              const trackLabel = `${isDynamic ? "🔷 " : ""}${t?.defaultDisplayName || trackName}`;
              const sections = sectionsByTrack[trackName];

              return (
                <div key={trackName}>
                  {/* Track row */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "24px 1fr",
                      padding: "6px 8px",
                      borderBottom: "1px solid #3a3a3a",
                      alignItems: "center"
                    }}
                  >
                    <button
                      onClick={() => toggleTrack(trackName)}
                        style={{
                            width: 20,
                            height: 20,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "transparent",
                            border: "1px solid #555",
                            borderRadius: 4,
                            fontSize: 12,
                            lineHeight: 1,
                            padding: 0,
                            cursor: "pointer",
                        }}
                      title={isExpanded ? "Collapse" : "Expand"}
                    >
                      {isExpanded ? "−" : "+"}
                    </button>

                    <div style={{ fontWeight: 700 }}>{trackLabel}</div>
                  </div>

                  {/* Sections (indented) */}
                  {isExpanded && (
                    <div>
                      {loadingTrack === trackName && (
                        <div style={{ padding: "6px 8px", color: "#bbb" }}>Loading sections…</div>
                      )}
                      {sections && Object.entries(sections).map(([sectionKey, s]) => {
                        const secExpanded = expandedSections.has(`${trackName}::${sectionKey}`);
                        const buttonLabel = s?.defaultDisplayName ?? sectionKey;  // "button name"
                        const sectionLineGray = t?.simple === true;                // simple tracks: gray the line

                        return (
                          <div key={sectionKey}>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "24px 1fr",
                                padding: "6px 8px 6px 32px",
                                borderBottom: "1px dashed #3a3a3a",
                                alignItems: "center",
                                color: sectionLineGray ? "#9a9a9a" : "inherit"
                              }}
                            >
                              <button
                                onClick={() => toggleSection(trackName, sectionKey)}
                                style={{
                                    width: 20,
                                    height: 20,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: "transparent",
                                    border: "1px solid #555",
                                    borderRadius: 4,
                                    fontSize: 12,
                                    lineHeight: 1,
                                    padding: 0,
                                    cursor: "pointer",
                                }}
                                title={secExpanded ? "Collapse" : "Expand"}
                              >
                                {secExpanded ? "−" : "+"}
                              </button>

                              <div>
                                <span style={{ fontWeight: 600 }}>{sectionKey}</span>
                                <span style={{ color: "#9a9a9a" }}>{", button: "}</span>
                                <span>{buttonLabel}</span>
                              </div>
                            </div>

                            {/* Modes (indented more) */}
                            {secExpanded && (
                              <div style={{ paddingLeft: 56 }}>
                                {renderModesRow(s)}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {!loadingTrack && sections && Object.keys(sections).length === 0 && (
                        <div style={{ padding: "6px 8px 6px 32px", color: "#bbb" }}>
                          (No sections found)
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Renders a single “modes row” for a section
function renderModesRow(section) {
  // modes can be absent, string, or array; base is always implied
  const raw = section?.modes;
  const modes = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const hasOnlyBase = modes.length === 0;

  const baseLabel = section?.defaultBaseModeName || "base";
  const baseIsGray = hasOnlyBase; // base only → gray
  const chipStyle = {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid #666",
    marginRight: 8,
    marginTop: 6,
    fontSize: 12,
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, padding: "2px 0 8px 0" }}>
      {/* base */}
      <span
        style={{
          ...chipStyle,
          color: baseIsGray ? "#9a9a9a" : "white",
          borderColor: baseIsGray ? "#555" : "#888",
        }}
        title="Base mode"
      >
        {hasOnlyBase ? "base" : `${baseLabel} `}
        {!hasOnlyBase && <span style={{ color: "#9a9a9a" }}>(base)</span>}
      </span>

      {/* other modes */}
      {modes.map((m) => (
        <span key={m} style={{ ...chipStyle }}>
          {m}
        </span>
      ))}
    </div>
  );
}
