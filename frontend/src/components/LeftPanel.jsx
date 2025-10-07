import React, { useEffect, useMemo, useState } from "react";
import UsersPanel from "./UsersPanel";

const LS_PANEL_OPEN = "ui.panelOpen";
const LS_ROOM_CHOICE = "ui.roomChoice";       // "awc" | "private"
const LS_ROLE = "wizamp.role";                // "GM" | "PASSIVE_BTS" | "PASSIVE"
const LS_NAME = "wizamp.displayName";

function persist(key, val) { try { localStorage.setItem(key, val); } catch {} }
function readStr(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }

export default function LeftPanel({
  engine,
  roomState,
  setOnlineEnabled,
  setRoomId,
  currentRoomId,
  role, setRole,
  displayName, setDisplayName,      // <-- add these props from App.jsx
  room,                              // optional: pass the room hook if you want to “re-HELLO” on name change
}) {
  // Expand/collapse
  const [open, setOpen] = useState(() => (readStr(LS_PANEL_OPEN, "true") === "true"));
  useEffect(() => persist(LS_PANEL_OPEN, String(open)), [open]);

  // Room choice (URL <-> state)
  const [choice, setChoice] = useState(() => {
    const usp = new URLSearchParams(window.location.search);
    const urlRoom = usp.get("room");
    if (urlRoom) return "awc";
    return readStr(LS_ROOM_CHOICE, "awc");
  });
  useEffect(() => persist(LS_ROOM_CHOICE, choice), [choice]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (choice === "awc") {
      setOnlineEnabled?.(true);
      setRoomId?.("awc");
      url.searchParams.set("room", "awc");
    } else {
      setOnlineEnabled?.(false);
      setRoomId?.(null);
      url.searchParams.delete("room");
    }
    window.history.replaceState({}, "", url);
  }, [choice, setOnlineEnabled, setRoomId]);

  // Role
  const [roleLocal, setRoleLocal] = useState(() => readStr(LS_ROLE, role || "GM"));
  useEffect(() => { setRole?.(roleLocal); persist(LS_ROLE, roleLocal); }, [roleLocal, setRole]);

  const displayRole = useMemo(() => {
    if (roleLocal === "GM") return "Audio Manager";
    if (roleLocal === "PASSIVE_BTS") return "BTS";
    return "Player";
  }, [roleLocal]);

  // Display name (persist, and optionally tell the room hook)
  const [nameLocal, setNameLocal] = useState(() => readStr(LS_NAME, displayName || ""));
  useEffect(() => {
    setDisplayName?.(nameLocal);
    persist(LS_NAME, nameLocal);
    // optional: if your room hook exposes a name update, call it:
    try { room?.setName?.(nameLocal); } catch {}
  }, [nameLocal, setDisplayName, room]);

  const users = roomState?.users || [];
  const latencyMs = roomState?.latencyMs ?? null;
  const offsetMs = roomState?.serverOffsetMs ?? null;
  const isOnline = choice === "awc";
  const Triangle = open ? "△" : "▽";

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
        <div style={{ flex: 1, fontWeight: 700, fontSize: 16 }}>
            {isOnline ? "🪄 A Wizard's Chronicle (AWC)" : "🚪 Private Session (offline)"}
        </div>
        <div style={{ fontSize: 16, opacity: 0.9 }}>{Triangle}</div>
      </button>

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.12)" }} />

      {open && (
        <div style={{ padding: 12, display: "grid", gap: 12 }}>
          {/* Display name */}
          <div>
            <label style={{ display: "block", fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Display Name</label>
            <input
              value={nameLocal}
              onChange={(e) => setNameLocal(e.target.value)}
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
              onChange={(e) => setChoice(e.target.value)}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 8,
                background: "#0f172a", color: "white", border: "1px solid rgba(255,255,255,0.15)"
              }}
            >
              <option value="awc">🪄 A Wizard&apos;s Chronicle (AWC)</option>
              <option value="private">🚪 Private Session (offline)</option>
            </select>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
              {isOnline ? "🌐 Online" : "Offline"}
            </div>
          </div>

          {/* Role selector */}
          <div>
            <label style={{ display: "block", fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Role</label>
            <select
              value={roleLocal}
              onChange={(e) => setRoleLocal(e.target.value)}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 8,
                background: "#0f172a", color: "white", border: "1px solid rgba(255,255,255,0.15)"
              }}
            >
              <option value="GM">🎛️ Audio Manager (GM/DJ/Admin)</option>
              <option value="PASSIVE_BTS">👁️ BTS (no touching!)</option>
              <option value="PASSIVE">🎧 Player (Player/Listener)</option>
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
