import { useEffect, useState } from "react";
import UsersPanel from "./UsersPanel";
import Icon from "./Icon";

const LS_PANEL_OPEN = "ui.panelOpen";
function persist(key, val) { try { localStorage.setItem(key, val); } catch {} }
function readStr(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }

export default function LeftPanel({
  roomState,
  setRoomId,
  currentRoomId,
  role, setRole,
  displayName, setDisplayName,      // <-- add these props from App.jsx
}) {
  // Expand/collapse
  const [open, setOpen] = useState(() => (readStr(LS_PANEL_OPEN, "true") === "true"));
  useEffect(() => persist(LS_PANEL_OPEN, String(open)), [open]);

  const choice = currentRoomId ? "awc" : "private";
  const displayRole = role === "GM" ? "Audio Manager" : role === "PASSIVE_BTS" ? "BTS" : "Player";
  const users = roomState?.users || [];
  const latencyMs = roomState?.latencyMs ?? null;
  const offsetMs = roomState?.serverOffsetMs ?? null;
  const isOnline = choice === "awc";

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        left: 12,
        zIndex: 80,
        width: 320,
        maxWidth: "calc(100vw - 24px)",
        background: "rgba(20,20,24,0.92)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12,
        boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
        overflow: "hidden",
        pointerEvents: "auto",
      }}
    >
      {/* Header: icon + title + triangle */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Show/Hide"
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          padding: "10px 12px", cursor: "pointer", background: "transparent",
          color: "white", border: "none", textAlign: "left",
        }}
      >
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 16 }}>
            <Icon name={isOnline ? "wand" : "door"} size={19} />
            {isOnline ? "A Wizard's Chronicle (AWC)" : "Private Session (offline)"}
        </div>
        <div style={{ width: 10, height: 10, opacity: 0.9, borderRight: "2px solid currentColor", borderBottom: "2px solid currentColor", transform: open ? "rotate(225deg) translate(-2px, -2px)" : "rotate(45deg) translate(-2px, -2px)" }} />
      </button>

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.12)" }} />

      {open && (
        <div style={{ padding: 12, display: "grid", gap: 12 }}>
          {/* Display name */}
          <div>
            <label style={{ display: "block", fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Display Name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              spellCheck="false"
              style={{
                width: "93%", padding: "8px 10px", borderRadius: 8,
                background: "#0f172a", color: "white", border: "1px solid rgba(255,255,255,0.15)"
              }}
            />
          </div>

          {/* Room selector */}
          <div>
            <label style={{ display: "block", fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Room</label>
            <select
              value={choice}
              onChange={(e) => setRoomId(e.target.value === "private" ? "" : "awc")}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 8,
                background: "#0f172a", color: "white", border: "1px solid rgba(255,255,255,0.15)"
              }}
            >
              <option value="awc">A Wizard&apos;s Chronicle (AWC)</option>
              <option value="private">Private Session (offline)</option>
            </select>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
              <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><Icon name={isOnline ? "globe" : "door"} size={13} />{isOnline ? "Online" : "Offline"}</span>
            </div>
          </div>

          {/* Role selector */}
          <div>
            <label style={{ display: "block", fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 8,
                background: "#0f172a", color: "white", border: "1px solid rgba(255,255,255,0.15)"
              }}
            >
              <option value="GM">Audio Manager (GM/DJ)</option>
              <option value="PASSIVE_BTS">BTS (no touching!)</option>
              <option value="PASSIVE">Player (passive listening)</option>
            </select>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>Current: {displayRole}</div>
          </div>

          {/* Users panel */}
          {isOnline && (
            <div>
              <UsersPanel users={users} latencyMs={latencyMs} offsetMs={offsetMs} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
