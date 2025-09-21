import { useEffect, useRef } from "react";

// Top-anchored settings modal with "close on outside press" that only
// triggers if both mousedown AND mouseup occur on the overlay.
export default function SettingsModal({
  open,
  onClose,

  // Settings state + setters
  fadeOutSeconds, setFadeOutSeconds,
  pauseFadeSeconds, setPauseFadeSeconds,
  showStatus, setShowStatus,
  appIconName, setAppIconName, allIconNames = [],

  // Online features
  onlineEnabled, setOnlineEnabled,
  role, setRole,
  displayName, setDisplayName,
}) {
  const overlayRef = useRef(null);
  const mouseDownOnOverlay = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      onMouseDown={(e) => { mouseDownOnOverlay.current = (e.target === overlayRef.current); }}
      onMouseUp={(e) => {
        if (e.target === overlayRef.current && mouseDownOnOverlay.current) onClose?.();
        mouseDownOnOverlay.current = false;
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "flex-start",     // anchor near top so growth is downward
        justifyContent: "center",
        paddingTop: "6vh",
        zIndex: 9999,
        overflowY: "auto",
      }}
      aria-modal="true"
      role="dialog"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 360,
          background: "#2d2d2d",
          color: "white",
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Settings</h2>
          <button
            onClick={() => onClose?.()}
            style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "white" }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Fade-out on Stop */}
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
                  setFadeOutSeconds?.(clamped);
                }
              }}
              style={{ width: 90, padding: "6px 8px" }}
            />
            <span>seconds of fade-out when Stop is pressed</span>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: "#bbb" }}>(0 = instantaneous, max 30s)</div>
        </div>

        {/* Pause fade */}
        <div style={{ marginTop: 16 }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
            Pause fade
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="number" min={1} max={30} step={0.1}
              value={pauseFadeSeconds}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) {
                  const clamped = Math.max(1, Math.min(30, v));
                  setPauseFadeSeconds?.(clamped);
                }
              }}
              style={{ width: 90, padding: "6px 8px" }}
            />
            <span>seconds to fade when Pausing</span>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: "#bbb" }}>(1–30s)</div>
        </div>

        {/* Show status bar */}
        <div style={{ marginTop: 20, paddingTop: 12, borderTop: "1px solid #444" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={!!showStatus}
              onChange={(e) => setShowStatus?.(e.target.checked)}
            />
            <span>Show status bar</span>
          </label>
        </div>

        {/* App icon */}
        <div style={{ marginTop: 16 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>App icon:</span>
            <select
              value={appIconName}
              onChange={(e) => setAppIconName?.(e.target.value)}
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

        {/* --- Online (beta) --- */}
        <div style={{ marginTop: 20, paddingTop: 12, borderTop: "1px solid #444" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={!!onlineEnabled}
              onChange={(e) => setOnlineEnabled?.(e.target.checked)}
              id="onlineToggle"
            />
            <label htmlFor="onlineToggle" style={{ fontWeight: 600 }}>
              Online (beta)
            </label>
          </div>
          <div style={{ fontSize: 12, color: "#bbb", marginTop: -6 }}>
            (Requires backend later; safe to leave ON/OFF now)
          </div>

          {/* Role */}
          <div style={{ marginTop: 12 }}>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole?.(e.target.value)}
              style={{ padding: "6px 8px", borderRadius: 6, width: "100%" }}
              disabled={!onlineEnabled}
            >
              <option value="GM">GM (Active)</option>
              <option value="Player">Player (Passive)</option>
            </select>
          </div>

          {/* Display Name */}
          <div style={{ marginTop: 12 }}>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
              Display name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName?.(e.target.value)}
              placeholder="e.g., Dylan"
              style={{ width: "100%", padding: "6px 8px", borderRadius: 6 }}
              disabled={!onlineEnabled}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
