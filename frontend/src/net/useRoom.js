// src/net/useRoom.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const ONLINE_ENV = (import.meta.env?.VITE_ONLINE_MODE === 'true');
const WS_URL = import.meta.env?.VITE_WS_URL || "";
const PING_INTERVAL_MS = 5000;

function getRoomIdFromUrl() {
  try {
    const u = new URL(window.location.href);
    return u.searchParams.get("room") || "";
  } catch {
    return "";
  }
}

export function useRoom({ onlineEnabled, displayName, role, onPlay, onSetTrack } = {}) {
  const shouldOnline = ONLINE_ENV && onlineEnabled && !!WS_URL;
  const roomId = useMemo(() => getRoomIdFromUrl(), []);

  // Keep a ref to the onPlay and onSetTrackRef callbacks so we don't reconnect on every render
  const onPlayRef = useRef(onPlay);
  useEffect(() => { onPlayRef.current = onPlay; }, [onPlay]);
  const onSetTrackRef = useRef(onSetTrack);
  useEffect(() => { onSetTrackRef.current = onSetTrack; }, [onSetTrack]);

  const [connected, setConnected] = useState(false);
  const [users, setUsers] = useState([]);
  const [lastError, setLastError] = useState(null);
  const [latencyMs, setLatencyMs] = useState(null);
  const [offsetMs, setOffsetMs] = useState(0); // serverNow ≈ Date.now() + offsetMs

  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const pingTimer = useRef(null);
  const lastReadyRef = useRef(null);
  const connIdRef = useRef(0);
  const startedRef = useRef(false);

  // NTP-ish smoothing
  const updateOffset = useCallback((rtt, serverTimeMs, clientSendMs) => {
    const clientNow = Date.now();
    const estLatency = Math.max(0, clientNow - clientSendMs - rtt); // just in case clock slip
    const oneWay = rtt / 2;
    const estimateServerNow = serverTimeMs + oneWay; // server timestamp likely at mid-RTT
    const newOffset = estimateServerNow - clientNow;
    // EMA smoothing
    setLatencyMs(prev => prev == null ? Math.round(oneWay) : Math.round(prev * 0.8 + oneWay * 0.2));
    setOffsetMs(prev => prev * 0.8 + newOffset * 0.2);
  }, []);

  const serverNowMs = useCallback(() => Date.now() + offsetMs, [offsetMs]);

  const connect = useCallback(() => {
    if (!shouldOnline || !roomId) return;

    if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
    if (pingTimer.current) { clearInterval(pingTimer.current); pingTimer.current = null; }

    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    const myId = ++connIdRef.current;

    ws.onopen = () => {
      if (connIdRef.current !== myId) return;
      setConnected(true);
      console.log("[room] OPEN");
      // HELLO (seed ready)
      ws.send(JSON.stringify({
        type: "HELLO",
        roomId,
        name: displayName || "Anon",
        role: role || "Player",
        clientVersion: "phase2",
        ready: lastReadyRef.current === null ? false : !!lastReadyRef.current,
      }));
      console.log("[room] → HELLO", { roomId, name: displayName || "Anon", role, ready: lastReadyRef.current });

      if (lastReadyRef.current !== null) {
        ws.send(JSON.stringify({ type: "SET_READY", ready: !!lastReadyRef.current }));
        console.log("[room] → SET_READY", lastReadyRef.current);
      }
      // start ping loop
      pingTimer.current = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const clientMs = Date.now();
        // send PING with echo
        ws.send(JSON.stringify({ type: "PING", clientMs }));
        // wait for PONG to compute rtt/offset (handled in onmessage)
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (ev) => {
      if (connIdRef.current !== myId) return;
      let data;
      try { data = JSON.parse(ev.data); } catch { return; }
      console.log("[room] ←", data.type, data);
      if (data.type === "PRESENCE" && Array.isArray(data.users)) {
        setUsers(data.users);
      } else if (data.type === "PONG") {
        const recv = Date.now();
        const clientSend = Number(data.echoClientMs) || recv;
        const rtt = Math.max(0, recv - clientSend);
        updateOffset(rtt, Number(data.serverTimeMs) || recv, clientSend);
      } else if (data.type === "SET_TRACK") {
        const name = String(data.name || "");
        if (name) onSetTrackRef.current?.(name);
      } else if (data.type === "STATE") {
        const name = String(data.selectedTrack || "");
        if (name) onSetTrackRef.current?.(name);
      } else if (data.type === "PLAY") {
        onPlayRef.current?.({ trackName: data.trackName, sectionName: data.sectionName, serverMs: Number(data.serverMs) });
      } else if (data.type === "ERROR") {
        setLastError({ code: data.code, message: data.message, notReady: data.notReady });
        console.warn("[room] ERROR", data);
      }
    };

    ws.onclose = (evt) => {
      if (connIdRef.current !== myId) return;
      setConnected(false);
      console.log("[room] socket closed; will retry in 2000ms");
      console.log("[room] CLOSE", { code: evt.code, reason: evt.reason, wasClean: evt.wasClean });
      if (pingTimer.current) { clearInterval(pingTimer.current); pingTimer.current = null; }
      if (shouldOnline && roomId) {
        reconnectTimer.current = setTimeout(connect, 2000);
      }
    };

    ws.onerror = () => { /* rely on onclose */ };
  }, [shouldOnline, roomId, displayName, role, updateOffset]);

  useEffect(() => {
    if (!shouldOnline || !roomId) return;
    if (startedRef.current) return;
    startedRef.current = true;
    connect();
    return () => {
      if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
      if (pingTimer.current) { clearInterval(pingTimer.current); pingTimer.current = null; }
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
    ws.send(JSON.stringify({ type: "SET_READY", ready: !!ready }));
  }, []);

  const requestPlay = useCallback(({ trackName, sectionName, delayMs = 2000, override = false }) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const serverMs = serverNowMs() + Math.max(0, delayMs);
    ws.send(JSON.stringify({ type: "PLAY_REQUEST", trackName, sectionName, serverMs, override }));
  }, [serverNowMs]);

  const requestSetTrack = useCallback((name) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "SET_TRACK_REQUEST", name }));
  }, []);

  const allReady = users.length > 0 && users.every(u => !!u.ready);

  return {
    onlineActive: shouldOnline && !!roomId,
    connected,
    users,
    roomId,
    setReady,
    requestPlay,
    requestSetTrack,
    serverNowMs,
    latencyMs,
    offsetMs,
    allReady,
    lastError,
  };
}
