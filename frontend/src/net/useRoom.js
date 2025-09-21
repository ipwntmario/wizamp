// src/net/useRoom.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const ONLINE_ENV = (import.meta.env?.VITE_ONLINE_MODE === 'true');
const WS_URL = import.meta.env?.VITE_WS_URL || "";

function getRoomIdFromUrl() {
  try {
    const u = new URL(window.location.href);
    return u.searchParams.get("room") || "";
  } catch {
    return "";
  }
}

export function useRoom({ onlineEnabled, displayName, role }) {
  const shouldOnline = ONLINE_ENV && onlineEnabled && !!WS_URL;
  const roomId = useMemo(() => getRoomIdFromUrl(), []);
  const [connected, setConnected] = useState(false);
  const [users, setUsers] = useState([]);

  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const lastReadyRef = useRef(null);      // null/true/false
  const connIdRef = useRef(0);            // increments per connect()
  const startedRef = useRef(false);       // dev StrictMode guard

  const connect = useCallback(() => {
    if (!shouldOnline || !roomId) return;

    // cancel any pending retries
    if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }

    // close any existing socket
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    const myId = ++connIdRef.current; // capture this connection’s id

    ws.onopen = () => {
      if (connIdRef.current !== myId) return; // stale open
      setConnected(true);
      console.log("[room] ws open → sending HELLO (ready:", lastReadyRef.current, ")");
      const hello = {
        type: "HELLO",
        roomId,
        name: displayName || "Anon",
        role: role || "Player",
        clientVersion: "phase1",
        ready: lastReadyRef.current === null ? false : !!lastReadyRef.current,
      };
      ws.send(JSON.stringify(hello));
      if (lastReadyRef.current !== null) {
        ws.send(JSON.stringify({ type: "SET_READY", ready: !!lastReadyRef.current }));
      }
    };

    ws.onmessage = (ev) => {
      if (connIdRef.current !== myId) return; // stale message
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "PRESENCE" && Array.isArray(data.users)) {
          console.log("[room] PRESENCE users:", data.users);
          setUsers(data.users);
        }
      } catch {}
    };

    ws.onclose = () => {
      if (connIdRef.current !== myId) return; // stale close
      setConnected(false);
      if (shouldOnline && roomId) {
        console.log("[room] ws closed → will retry");
        reconnectTimer.current = setTimeout(connect, 2000);
      }
    };

    ws.onerror = () => {
      // rely on onclose for retry
    };
  }, [shouldOnline, roomId, displayName, role]);

  useEffect(() => {
    if (!shouldOnline || !roomId) return;
    // Dev StrictMode mounts twice; only run once
    if (startedRef.current) return;
    startedRef.current = true;

    connect();

    return () => {
      if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) { try { ws.close(); } catch {} }
      startedRef.current = false;
    };
  }, [shouldOnline, roomId, connect]);

  const setReady = useCallback((ready) => {
    lastReadyRef.current = !!ready;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    console.log("[room] SET_READY →", ready);
    ws.send(JSON.stringify({ type: "SET_READY", ready: !!ready }));
  }, []);

  return {
    onlineActive: shouldOnline && !!roomId,
    connected,
    users,
    roomId,
    setReady,
  };
}
