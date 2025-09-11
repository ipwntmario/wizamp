// src/components/DatabaseModal.jsx
import { useMemo, useState } from "react";

/** Helper: consider a track "dynamic" when simple === false */
const isDynamic = (t) => t?.simple === false;
/** Helper: consider a track a "test" when test === true (you can set in trackData.json) */
const isTest = (name, t) => t?.test === true;

export default function DatabaseModal({
  open,
  onClose,
  tracks, // { [trackName]: { defaultDisplayName, basePath, simple, test?, ... } }
  // Preferences (optional; if not passed, sensible defaults are used)
  sortMode = "alpha-asc",         // "alpha-asc" | "alpha-desc" | "original"
  dynamicFirst = true,        // dynamic tracks grouped before simple (only for alpha sorts)
  hideTests = false,          // hide test tracks entirely
  onChangeSort,
  onChangeDynamicFirst,
  onChangeHideTests,
}) {
  const [expandedTracks, setExpandedTracks] = useState(() => new Set());
  const [expandedSections, setExpandedSections] = useState(() => new Set()); // keys: `${track}::${sectionKey}`
  const [sectionsByTrack, setSectionsByTrack] = useState({});               // cache: { trackName: { sections } }
  const [loadingTrack, setLoadingTrack] = useState(null);

  // --- Sorting (tracks only) ---
  const sortedTrackNames = useMemo(() => {
    if (!tracks) return [];

    const entries = Object.entries(tracks);

    // Split tests from non-tests (tests retain original order at top if not hidden)
    const testEntries = entries.filter(([name, t]) => isTest(name, t));
    const nonTestEntries = entries.filter(([name, t]) => !isTest(name, t));

    // Hide tests?
    const testBlock = hideTests ? [] : testEntries.map(([name]) => name);

    // Sort the non-test block based on sortMode
    let working = [...nonTestEntries];

    if (sortMode === "alpha-asc" || sortMode === "alpha-desc") {
      // sort by defaultDisplayName || name
      const cmp = (a, b) => {
        const an = a[1]?.defaultDisplayName || a[0];
        const bn = b[1]?.defaultDisplayName || b[0];
        return an.localeCompare(bn);
      };
      working.sort(cmp);
      if (sortMode === "alpha-desc") working.reverse();

      // dynamic-first (only for alpha sorts)
      if (dynamicFirst) {
        const dyn = working.filter(([_, t]) => isDynamic(t)).map(([name]) => name);
        const simple = working.filter(([_, t]) => !isDynamic(t)).map(([name]) => name);
        return [...testBlock, ...dyn, ...simple];
      }

      return [...testBlock, ...working.map(([name]) => name)];
    }

    // "original": keep given order for non-tests
    return [...testBlock, ...working.map(([name]) => name)];
  }, [tracks, sortMode, dynamicFirst, hideTests]);

  const fetchSectionsIfNeeded = async (trackName) => {
    if (sectionsByTrack[trackName]) return;
    try {
      setLoadingTrack(trackName);
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
  };

  const toggleTrack = async (trackName) => {
    const next = new Set(expandedTracks);
    if (next.has(trackName)) {
      next.delete(trackName);
      setExpandedTracks(next);
      return;
    }
    await fetchSectionsIfNeeded(trackName);
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

  const expandAll = async () => {
    // expand all tracks (and load each if needed), then all sections
    const allTracks = sortedTrackNames;
    for (const name of allTracks) {
      await fetchSectionsIfNeeded(name);
    }
    setExpandedTracks(new Set(allTracks));
    // expand every section for each track
    const allSectionKeys = [];
    for (const name of allTracks) {
      const secs = sectionsByTrack[name] || {};
      for (const sKey of Object.keys(secs)) {
        allSectionKeys.push(`${name}::${sKey}`);
      }
    }
    setExpandedSections(new Set(allSectionKeys));
  };

  const collapseAll = () => {
    setExpandedTracks(new Set());
    setExpandedSections(new Set());
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
          width: 720, maxHeight: "80vh",
          background: "#2d2d2d", color: "white",
          borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
          display: "flex", flexDirection: "column"
        }}
      >
        {/* Sticky header */}
        <div style={{
          position: "sticky", top: 0,
          background: "#2d2d2d", zIndex: 2,
          borderBottom: "1px solid #444", padding: 12,
          display: "flex", alignItems: "center", justifyContent: "space-between"
        }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Database</h2>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "white" }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Sticky controls bar */}
        <div style={{
          position: "sticky", top: 48, // immediately under the header
          background: "#2d2d2d", zIndex: 1,
          borderBottom: "1px solid #444", padding: "8px 12px",
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap"
        }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#bbb" }}>Sort:</span>
            <select
              value={sortMode}
              onChange={(e) => onChangeSort?.(e.target.value)}
              style={{ padding: "4px 6px", borderRadius: 6, background: "#222", color: "white", border: "1px solid #555" }}
            >
              <option value="alpha-asc">alphabetical (ascending)</option>
              <option value="alpha-desc">alphabetical (descending)</option>
              <option value="original">original</option>
            </select>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={dynamicFirst}
              onChange={(e) => onChangeDynamicFirst?.(e.target.checked)}
              disabled={!(sortMode === "alpha-asc" || sortMode === "alpha-desc")}
            />
            <span style={{ color: "#bbb" }}>keep dynamic on top</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={hideTests}
              onChange={(e) => onChangeHideTests?.(e.target.checked)}
            />
            <span style={{ color: "#bbb" }}>hide test tracks</span>
          </label>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button
              onClick={expandAll}
              style={{ background: "transparent", border: "1px solid #555", borderRadius: 6, padding: "4px 8px", color: "white", cursor: "pointer" }}
            >
              expand all
            </button>
            <button
              onClick={collapseAll}
              style={{ background: "transparent", border: "1px solid #555", borderRadius: 6, padding: "4px 8px", color: "white", cursor: "pointer" }}
            >
              collapse all
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ overflow: "auto" }}>
          {/* Header row */}
          <div style={{ display: "grid", gridTemplateColumns: "24px 1fr", padding: "6px 12px", borderBottom: "1px solid #444", color: "#bbb" }}>
            <div />
            <div>Name</div>
          </div>

          {/* Tracks */}
          <div>
            {sortedTrackNames.map((trackName) => {
              const t = tracks[trackName];
              const expanded = expandedTracks.has(trackName);
              const sections = sectionsByTrack[trackName];
              const dyn = isDynamic(t);
              const test = isTest(trackName, t);
              const label = `${dyn ? "🔷 " : ""}${t?.defaultDisplayName || trackName}`;
              const prefix = test ? "🧪 " : "";

              return (
                <div key={trackName}>
                  {/* Track row */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "24px 1fr",
                      padding: "6px 12px",
                      borderBottom: "1px solid #3a3a3a",
                      alignItems: "center"
                    }}
                  >
                    <button
                      onClick={() => toggleTrack(trackName)}
                      style={{
                        width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
                        background: "transparent", border: "1px solid #666", color: "white",
                        borderRadius: 4, fontSize: 12, lineHeight: 1, padding: 0, cursor: "pointer"
                      }}
                      title={expanded ? "Collapse" : "Expand"}
                    >
                      {expanded ? "−" : "+"}
                    </button>
                    <div style={{ fontWeight: 700 }}>
                      {prefix}{label}
                    </div>
                  </div>

                  {/* Sections */}
                  {expanded && (
                    <div>
                      {loadingTrack === trackName && (
                        <div style={{ padding: "6px 12px", color: "#bbb" }}>Loading sections…</div>
                      )}
                      {sections && Object.entries(sections).map(([sectionKey, s]) => {
                        const secKey = `${trackName}::${sectionKey}`;
                        const secExpanded = expandedSections.has(secKey);
                        const buttonLabel = s?.defaultDisplayName ?? sectionKey; // "button name"
                        const sectionGray = t?.simple === true;

                        return (
                          <div key={sectionKey}>
                            <div
                              style={{
                                display: "grid", gridTemplateColumns: "24px 1fr",
                                padding: "6px 12px 6px 36px",
                                borderBottom: "1px dashed #3a3a3a",
                                alignItems: "center",
                                color: sectionGray ? "#9a9a9a" : "inherit"
                              }}
                            >
                              <button
                                onClick={() => toggleSection(trackName, sectionKey)}
                                style={{
                                  width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
                                  background: "transparent", border: "1px solid #666", color: "white",
                                  borderRadius: 4, fontSize: 12, lineHeight: 1, padding: 0, cursor: "pointer"
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

                            {/* Modes */}
                            {secExpanded && (
                              <div style={{ paddingLeft: 60 }}>
                                {renderModesRow(s)}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {!loadingTrack && sections && Object.keys(sections).length === 0 && (
                        <div style={{ padding: "6px 12px 6px 36px", color: "#bbb" }}>
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

function renderModesRow(section) {
  const raw = section?.modes;
  const modes = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const hasOnlyBase = modes.length === 0;

  const baseLabel = section?.defaultBaseModeName || "base";
  const baseIsGray = hasOnlyBase;
  const chip = {
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
      <span
        style={{
          ...chip,
          color: baseIsGray ? "#9a9a9a" : "white",
          borderColor: baseIsGray ? "#555" : "#888",
        }}
        title="Base mode"
      >
        {hasOnlyBase ? "base" : `${baseLabel} `}
        {!hasOnlyBase && <span style={{ color: "#9a9a9a" }}>(base)</span>}
      </span>
      {modes.map((m) => (
        <span key={m} style={{ ...chip }}>{m}</span>
      ))}
    </div>
  );
}
