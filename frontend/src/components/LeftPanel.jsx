import { useEffect, useRef, useState } from "react";
import UsersPanel from "./UsersPanel";
import Icon from "./Icon";

const LS_PANEL_OPEN = "ui.panelOpen";
const LONG_PRESS_MS = 550;
const rooms = [
  { id: "", name: "Private Session", detail: "Offline", icon: "door", private: true },
  { id: "awc", name: "A Wizard's Chronicle", detail: "Online room", icon: "wand" },
];

function persist(key, val) { try { localStorage.setItem(key, val); } catch {} }
function readStr(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }

export default function LeftPanel({
  roomState,
  setRoomId,
  currentRoomId,
  roomIdentities,
  setRoomIdentity,
}) {
  const [open, setOpen] = useState(() => readStr(LS_PANEL_OPEN, "true") === "true");
  const [editingRoomId, setEditingRoomId] = useState(null);
  const gesture = useRef(null);
  const longPressTimer = useRef(null);
  const suppressClick = useRef(false);

  useEffect(() => persist(LS_PANEL_OPEN, String(open)), [open]);
  useEffect(() => () => clearTimeout(longPressTimer.current), []);

  const activeRoom = rooms.find((room) => room.id === currentRoomId) || rooms[0];
  const users = roomState?.users || [];
  const latencyMs = roomState?.latencyMs ?? null;
  const offsetMs = roomState?.serverOffsetMs ?? null;
  const awcIdentity = roomIdentities?.awc || { role: "GM", displayName: "" };

  function closePanel() {
    setOpen(false);
    setEditingRoomId(null);
  }

  function selectRoom(roomId) {
    setRoomId(roomId);
    closePanel();
  }

  function beginTouch(event, room) {
    if (event.pointerType !== "touch") return;
    if (gesture.current) return;
    gesture.current = { x: event.clientX, y: event.clientY, longPressed: false };
    clearTimeout(longPressTimer.current);
    if (!room?.private) {
      longPressTimer.current = setTimeout(() => {
        if (!gesture.current) return;
        gesture.current.longPressed = true;
        setEditingRoomId(room.id);
        navigator.vibrate?.(12);
      }, LONG_PRESS_MS);
    }
  }

  function moveTouch(event) {
    if (!gesture.current || event.pointerType !== "touch") return;
    const dx = event.clientX - gesture.current.x;
    const dy = event.clientY - gesture.current.y;
    if (Math.hypot(dx, dy) > 10) clearTimeout(longPressTimer.current);
    if (dx < -64 && Math.abs(dx) > Math.abs(dy)) {
      clearTimeout(longPressTimer.current);
      gesture.current = null;
      closePanel();
    }
  }

  function endTouch() {
    clearTimeout(longPressTimer.current);
    const wasLongPress = gesture.current?.longPressed;
    gesture.current = null;
    if (wasLongPress) {
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 0);
    }
    return wasLongPress;
  }

  return (
    <aside
      className={`session-panel ${open ? "is-open" : "is-closed"}`}
      aria-label="Session rooms"
      onPointerMove={moveTouch}
      onPointerCancel={endTouch}
    >
      <div className="session-panel__bar">
        <button
          className="session-panel__menu"
          type="button"
          aria-label={open ? "Close rooms" : "Open rooms"}
          aria-expanded={open}
          onClick={() => {
            setOpen((value) => !value);
            if (open) setEditingRoomId(null);
          }}
        >
          <Icon name="menu" size={22} />
        </button>
        <div className="session-panel__current" aria-hidden={open}>
          <span className={`session-room__icon session-room__icon--${activeRoom.private ? "private" : "online"}`}>
            <Icon name={activeRoom.icon} size={19} />
          </span>
          <span>{activeRoom.name}</span>
        </div>
      </div>

      <div
        className="session-panel__drawer"
        aria-hidden={!open}
        onPointerDown={(event) => beginTouch(event, null)}
        onPointerUp={endTouch}
      >
        <div className="session-panel__heading">
          <span>Sessions</span>
          <span className="session-panel__hint">Swipe left to close</span>
        </div>

        <div className="session-panel__rooms">
          {rooms.map((room) => {
            const selected = room.id === currentRoomId;
            return (
              <div className="session-room-wrap" key={room.private ? "private" : room.id}>
                <button
                  type="button"
                  className={`session-room ${selected ? "is-selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() => {
                    if (!suppressClick.current) selectRoom(room.id);
                  }}
                  onPointerDown={(event) => beginTouch(event, room)}
                  onPointerUp={(event) => {
                    if (event.pointerType === "touch" && endTouch()) event.preventDefault();
                  }}
                  onContextMenu={(event) => event.preventDefault()}
                >
                  <span className={`session-room__icon session-room__icon--${room.private ? "private" : "online"}`}>
                    <Icon name={room.icon} size={22} />
                  </span>
                  <span className="session-room__copy">
                    <strong>{room.name}</strong>
                    <small>{room.detail}</small>
                  </span>
                  {!room.private && (
                    <span
                      className="session-room__more"
                      role="button"
                      tabIndex={0}
                      aria-label={`Edit identity for ${room.name}`}
                      aria-expanded={editingRoomId === room.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditingRoomId((value) => value === room.id ? null : room.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          setEditingRoomId((value) => value === room.id ? null : room.id);
                        }
                      }}
                    >
                      <Icon name="moreVertical" size={20} />
                    </span>
                  )}
                </button>

                {!room.private && (
                  <div
                    className={`session-identity ${editingRoomId === room.id ? "is-visible" : ""}`}
                    aria-hidden={editingRoomId !== room.id}
                    inert={editingRoomId !== room.id ? "" : undefined}
                  >
                    <label>
                      <span>Display name</span>
                      <input
                        value={awcIdentity.displayName}
                        onChange={(event) => setRoomIdentity(room.id, { displayName: event.target.value })}
                        placeholder="Your name"
                        spellCheck="false"
                      />
                    </label>
                    <label>
                      <span>Role</span>
                      <select
                        value={awcIdentity.role}
                        onChange={(event) => setRoomIdentity(room.id, { role: event.target.value })}
                      >
                        <option value="GM">Audio Manager</option>
                        <option value="PASSIVE_BTS">BTS</option>
                        <option value="PASSIVE">Player</option>
                      </select>
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {currentRoomId && (
          <div className="session-panel__presence">
            <UsersPanel users={users} latencyMs={latencyMs} offsetMs={offsetMs} />
          </div>
        )}
      </div>
    </aside>
  );
}
