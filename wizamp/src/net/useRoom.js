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
  const [users, setUsers] = useState([]); // [{id,name,role,ready}]
  const wsRef = useRef(null);
  const helloSentRef = useRef(false);
  const reconnectTimer = useRef(null);
  const lastReadyRef = useRef(null); // null = unknown, true/false otherwise

  const connect = useCallback(() => {
    if (!shouldOnline || !roomId) return;
    if (wsRef.current) { try { wsRef.current.close(); } catch {} wsRef.current = null; }
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      helloSentRef.current = true;
      const hello = {
        type: "HELLO",
        roomId,
        name: displayName || "Anon",
        role: role || "Player",
        clientVersion: "phase1"
      };
      ws.send(JSON.stringify(hello));
      // After HELLO, restore last known ready (if any)
      if (lastReadyRef.current !== null) {
        ws.send(JSON.stringify({ type: "SET_READY", ready: !!lastReadyRef.current }));
      }
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "PRESENCE" && Array.isArray(data.users)) {
          setUsers(data.users);
        }
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // basic retry after 2s if conditions still true
      if (shouldOnline && roomId) {
        reconnectTimer.current = setTimeout(connect, 2000);
      }
    };

    ws.onerror = () => {
      // rely on onclose to retry
    };
  }, [shouldOnline, roomId, displayName, role]);

  useEffect(() => {
    if (!shouldOnline || !roomId) return;
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) { try { ws.close(); } catch {} }
    };
  }, [shouldOnline, roomId, connect]);

  // API: setReady(true/false)
  const setReady = useCallback((ready) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "SET_READY", ready: !!ready }));
  }, []);

  return {
    onlineActive: shouldOnline && !!roomId, // indicates connection is intended
    connected,
    users,
    roomId,
    setReady,
  };
}
