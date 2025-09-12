function toArray(x) { return Array.isArray(x) ? x : (x ? [x] : []); }

export default function SectionPanel({
  sections,
  currentSectionName,
  queuedSectionName,
  autoLockedTargets = [],
  onToggleQueuedSection,
  largeButtons = false,

  // modes
  currentModeName = "base",
  queuedModeName = null,
  onToggleQueuedMode = () => {},   // <-- default no-op so modes row can render
  getBaseModeLabel = () => "base",

  // rename-aware helpers from App (all optional)
  getSectionTitle,               // (sectionKey) => string
  getSectionButtonLabel,         // (sectionKey) => string
  getModeLabel,                  // (sectionKey, "__base__"|modeName) => string
}) {
  const current = sections[currentSectionName];
  const nextSections = toArray(current?.nextSection);
  if (!current) return null;

  // ----- MODES ROW -----
  const extraModes = toArray(current?.modes);
  const modes = ["base", ...extraModes]; // base always implied
  const showModes = modes.length > 1;    // <-- no longer depends on handler type

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Section transition buttons */}
      {nextSections.length > 0 && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {nextSections.map((name) => {
            const isQueued = queuedSectionName === name;
            const isAutoLocked = autoLockedTargets.includes(name);
            const targetSection = sections[name] || {};
            const isEnd = targetSection?.type === "end";

            // Base styles
            let background = "#0b4a74";
            let color = "white";
            let border = "1px solid #555";
            let opacity = 1;

            if (isEnd) background = "#ad2f49"; // red end sections
            if (isQueued && !isAutoLocked) { background = "#ffe2a0"; color = "black"; }
            if (isAutoLocked && !isQueued) { background = "#696969"; opacity = 0.9; }
            if (isAutoLocked && isQueued) { background = "#988d61"; opacity = 0.9; }

            const sizeStyle = largeButtons
              ? { padding: "10px 20px", fontSize: 16 }
              : { padding: "8px 14px", fontSize: 14 };

            // Title tooltip (rename-aware if helper provided)
            const titleText = getSectionTitle
              ? getSectionTitle(name)
              : (sections[name]?.defaultDisplayName ?? name);

            // Visible button label:
            // 1) App-provided override helper (already rename-aware)
            // 2) defaultButtonName if present
            // 3) rename-aware section title (so a renamed section shows on the button)
            // 4) fallback to raw key
            const label =
              (getSectionButtonLabel && getSectionButtonLabel(name)) ??
              sections?.[name]?.defaultButtonName ??
              (getSectionTitle ? getSectionTitle(name) : (sections?.[name]?.defaultDisplayName ?? name)) ??
              name;

            return (
              <button
                key={name}
                disabled={isAutoLocked}
                onClick={() => {
                  if (isAutoLocked) return;
                  if (isQueued) onToggleQueuedSection(null);
                  else onToggleQueuedSection(name);
                }}
                style={{
                  ...sizeStyle,
                  borderRadius: 8,
                  border,
                  cursor: isAutoLocked ? "not-allowed" : "pointer",
                  background, color, opacity,
                  minWidth: 120
                }}
                title={titleText}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Modes row (if multiple) */}
      {showModes && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {modes.map((mode) => {
            const isActive = currentModeName === mode;
            const isQueued = queuedModeName === mode && !isActive;

            let background = "#6d528c"; // default
            let color = "white";
            if (isQueued) { background = "#d299ba"; color = "black"; }
            if (isActive) { background = "white"; color = "black"; }

            const label = getModeLabel
              ? getModeLabel(currentSectionName, mode === "base" ? "__base__" : mode)
              : (mode === "base"
                  ? (getBaseModeLabel(currentSectionName) || "base")
                  : mode);

            return (
              <button
                key={mode}
                onClick={() => {
                  if (isActive) return; // active mode: no-op
                  if (isQueued) onToggleQueuedMode?.(null);
                  else onToggleQueuedMode?.(mode);
                }}
                style={{
                  padding: largeButtons ? "8px 14px" : "6px 12px",
                  fontSize: largeButtons ? 15 : 13,
                  borderRadius: 8,
                  border: "1px solid #555",
                  cursor: isActive ? "default" : "pointer",
                  background, color,
                  minWidth: 90
                }}
                title={label}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
