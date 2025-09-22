var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var index_default = {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return json({ ok: true, worker: "wizamp-worker" });
    }
    if (url.pathname === "/ws") {
      console.log("[worker] /ws request headers:", Object.fromEntries(req.headers));
      if (req.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }
      const id = env.ROOM_HUB.idFromName("hub");
      const stub = env.ROOM_HUB.get(id);
      return stub.fetch(req);
    }
    return new Response("Not found", { status: 404 });
  }
};
var RoomHub = class {
  static {
    __name(this, "RoomHub");
  }
  /** @param {DurableObjectState} state */
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.clients = /* @__PURE__ */ new Map();
    this.roomState = /* @__PURE__ */ new Map();
  }
  async fetch(req) {
    const upgrade = req.headers.get("Upgrade");
    console.log("[RoomHub] fetch upgrade:", upgrade);
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    console.log("[RoomHub] accepted websocket");
    return new Response(null, {
      status: 101,
      // Required in Miniflare
      webSocket: client
    });
  }
  // ---- WebSocket lifecycle handlers ----
  webSocketAccept(ws) {
    try {
      ws.send(JSON.stringify({ type: "WELCOME", serverTimeMs: Date.now() }));
    } catch {
    }
  }
  webSocketOpen(ws) {
    try {
      ws.send(JSON.stringify({ type: "WELCOME", serverTimeMs: Date.now() }));
    } catch {
    }
    console.log("[RoomHub] open:", ws);
  }
  webSocketMessage(ws, message) {
    let data;
    try {
      data = typeof message === "string" ? JSON.parse(message) : JSON.parse(new TextDecoder().decode(message));
    } catch (e) {
      console.log("[RoomHub] message parse error:", e);
      return;
    }
    console.log("[RoomHub] message:", data);
    if (!data || typeof data !== "object") return;
    switch (data.type) {
      case "HELLO": {
        const user = {
          id: crypto.randomUUID(),
          name: data.name || "Anon",
          role: data.role || "Player",
          ready: !!data.ready,
          roomId: data.roomId || "default"
        };
        this.clients.set(ws, user);
        console.log("[RoomHub] HELLO add:", user, "total:", this.clients.size);
        this.broadcastPresence(user.roomId);
        const rs = this.roomState.get(user.roomId);
        if (rs && rs.selectedTrack) {
          ws.send(JSON.stringify({
            type: "STATE",
            selectedTrack: rs.selectedTrack,
            seed: rs.seed ?? null,
            queuedSection: rs.queuedSection ?? null,
            queuedMode: rs.queuedMode ?? null,
            trackVolume: typeof rs.trackVolume === "number" ? rs.trackVolume : null,
            autoplay: !!rs.autoplay,
            playing: rs.playing || null
          }));
        }
        break;
      }
      case "SET_READY": {
        const u = this.clients.get(ws);
        if (!u) return;
        u.ready = !!data.ready;
        console.log("[RoomHub] SET_READY:", u.name, "\u2192", u.ready);
        this.broadcastPresence(u.roomId);
        break;
      }
      case "PING": {
        const u = this.clients.get(ws);
        if (!u) return;
        const payload = JSON.stringify({
          type: "PONG",
          serverTimeMs: Date.now(),
          echoClientMs: Number(data.clientMs) || 0
        });
        try {
          ws.send(payload);
        } catch {
        }
        break;
      }
      case "PLAY_REQUEST": {
        const u = this.clients.get(ws);
        if (!u) return;
        const roomId = u.roomId;
        const serverMs = Number(data.serverMs) || Date.now() + 2e3;
        const trackName = String(data.trackName || "");
        const sectionName = String(data.sectionName || "");
        const override = !!data.override;
        if (u.role !== "GM") {
          try {
            ws.send(JSON.stringify({ type: "ERROR", code: "FORBIDDEN", message: "Only GM can play." }));
          } catch {
          }
          break;
        }
        const usersInRoom = [];
        for (const [, ru] of this.clients) if (ru.roomId === roomId) usersInRoom.push(ru);
        const notReady = usersInRoom.filter((x) => !x.ready).map((x) => x.name);
        if (!override && notReady.length > 0) {
          console.log("[RoomHub] PLAY_REQUEST rejected (not ready):", notReady);
          try {
            ws.send(JSON.stringify({
              type: "ERROR",
              code: "NOT_READY",
              message: "Not all players are ready.",
              notReady
            }));
          } catch {
          }
          break;
        }
        console.log("[RoomHub] PLAY_REQUEST accepted", { roomId, trackName, sectionName, serverMs, override });
        const rs = this.roomState.get(roomId) || {};
        rs.playing = { trackName, sectionName, serverMs };
        this.roomState.set(roomId, rs);
        const payload = JSON.stringify({ type: "PLAY", trackName, sectionName, serverMs });
        for (const [sock, uu] of this.clients) {
          if (uu.roomId === roomId) {
            try {
              sock.send(payload);
            } catch {
            }
          }
        }
      }
      case "PAUSE_REQUEST": {
        const u = this.clients.get(ws);
        if (!u) return;
        if (u.role !== "GM") {
          try {
            ws.send(JSON.stringify({ type: "ERROR", code: "FORBIDDEN", message: "Only GM can pause." }));
          } catch {
          }
          break;
        }
        const roomId = u.roomId;
        console.log("[RoomHub] PAUSE_REQUEST", { roomId });
        const payload = JSON.stringify({ type: "PAUSE" });
        for (const [sock, uu] of this.clients) if (uu.roomId === roomId) {
          try {
            sock.send(payload);
          } catch {
          }
        }
        break;
      }
      case "STOP_REQUEST": {
        const u = this.clients.get(ws);
        if (!u) return;
        if (u.role !== "GM") {
          try {
            ws.send(JSON.stringify({ type: "ERROR", code: "FORBIDDEN", message: "Only GM can stop." }));
          } catch {
          }
          break;
        }
        const roomId = u.roomId;
        const fade = !!data.fade;
        console.log("[RoomHub] STOP_REQUEST", { roomId, fade });
        const payload = JSON.stringify({ type: "STOP", fade });
        for (const [sock, uu] of this.clients) if (uu.roomId === roomId) {
          try {
            sock.send(payload);
          } catch {
          }
        }
        const rs = this.roomState.get(roomId) || {};
        rs.playing = null;
        this.roomState.set(roomId, rs);
        break;
      }
      case "RESUME_REQUEST": {
        const u = this.clients.get(ws);
        if (!u) return;
        if (u.role !== "GM") {
          try {
            ws.send(JSON.stringify({ type: "ERROR", code: "FORBIDDEN", message: "Only GM can resume." }));
          } catch {
          }
          break;
        }
        const roomId = u.roomId;
        const serverMs = Number(data.serverMs) || Date.now() + 2e3;
        console.log("[RoomHub] RESUME_REQUEST", { roomId, serverMs });
        const payload = JSON.stringify({ type: "RESUME", serverMs });
        for (const [sock, uu] of this.clients) if (uu.roomId === roomId) {
          try {
            sock.send(payload);
          } catch {
          }
        }
        break;
      }
      case "SET_TRACK_REQUEST": {
        const u = this.clients.get(ws);
        if (!u) return;
        if (u.role !== "GM") {
          try {
            ws.send(JSON.stringify({ type: "ERROR", code: "FORBIDDEN", message: "Only GM can set track." }));
          } catch {
          }
          break;
        }
        const roomId = u.roomId;
        const name = String(data.name || "");
        if (!name) break;
        const seed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
        console.log("[RoomHub] SET_TRACK_REQUEST", { roomId, name });
        const rs = this.roomState.get(roomId) || {};
        rs.selectedTrack = name;
        rs.seed = seed;
        this.roomState.set(roomId, rs);
        const payload = JSON.stringify({ type: "SET_TRACK", name, seed });
        for (const [sock, uu] of this.clients) {
          if (uu.roomId === roomId) {
            try {
              sock.send(payload);
            } catch {
            }
          }
        }
        break;
      }
      case "QUEUE_SECTION_REQUEST": {
        const u = this.clients.get(ws);
        if (!u) return;
        if (u.role !== "GM") {
          try {
            ws.send(JSON.stringify({ type: "ERROR", code: "FORBIDDEN", message: "Only GM can queue section." }));
          } catch {
          }
          ;
          break;
        }
        const roomId = u.roomId;
        const name = String(data.name || "");
        const rs = this.roomState.get(roomId) || {};
        rs.queuedSection = name || null;
        this.roomState.set(roomId, rs);
        console.log("[RoomHub] QUEUE_SECTION_REQUEST", { roomId, name });
        const payload = JSON.stringify({ type: "QUEUE_SECTION", name });
        for (const [sock, uu] of this.clients) if (uu.roomId === roomId) {
          try {
            sock.send(payload);
          } catch {
          }
        }
        break;
      }
      case "CLEAR_SECTION_QUEUE_REQUEST": {
        const u = this.clients.get(ws);
        if (!u) return;
        if (u.role !== "GM") {
          try {
            ws.send(JSON.stringify({ type: "ERROR", code: "FORBIDDEN", message: "Only GM can clear section queue." }));
          } catch {
          }
          ;
          break;
        }
        const roomId = u.roomId;
        const rs = this.roomState.get(roomId) || {};
        rs.queuedSection = null;
        this.roomState.set(roomId, rs);
        console.log("[RoomHub] CLEAR_SECTION_QUEUE_REQUEST", { roomId });
        const payload = JSON.stringify({ type: "CLEAR_SECTION_QUEUE" });
        for (const [sock, uu] of this.clients) if (uu.roomId === roomId) {
          try {
            sock.send(payload);
          } catch {
          }
        }
        break;
      }
      case "QUEUE_MODE_REQUEST": {
        const u = this.clients.get(ws);
        if (!u) return;
        if (u.role !== "GM") {
          try {
            ws.send(JSON.stringify({ type: "ERROR", code: "FORBIDDEN", message: "Only GM can queue mode." }));
          } catch {
          }
          ;
          break;
        }
        const roomId = u.roomId;
        const name = String(data.name || "");
        const rs = this.roomState.get(roomId) || {};
        rs.queuedMode = name || null;
        this.roomState.set(roomId, rs);
        console.log("[RoomHub] QUEUE_MODE_REQUEST", { roomId, name });
        const payload = JSON.stringify({ type: "QUEUE_MODE", name });
        for (const [sock, uu] of this.clients) if (uu.roomId === roomId) {
          try {
            sock.send(payload);
          } catch {
          }
        }
        break;
      }
      case "CLEAR_MODE_QUEUE_REQUEST": {
        const u = this.clients.get(ws);
        if (!u) return;
        if (u.role !== "GM") {
          try {
            ws.send(JSON.stringify({ type: "ERROR", code: "FORBIDDEN", message: "Only GM can clear mode queue." }));
          } catch {
          }
          ;
          break;
        }
        const roomId = u.roomId;
        const rs = this.roomState.get(roomId) || {};
        rs.queuedMode = null;
        this.roomState.set(roomId, rs);
        console.log("[RoomHub] CLEAR_MODE_QUEUE_REQUEST", { roomId });
        const payload = JSON.stringify({ type: "CLEAR_MODE_QUEUE" });
        for (const [sock, uu] of this.clients) if (uu.roomId === roomId) {
          try {
            sock.send(payload);
          } catch {
          }
        }
        break;
      }
      case "SET_TRACK_VOLUME_REQUEST": {
        const u = this.clients.get(ws);
        if (!u) return;
        if (u.role !== "GM") {
          try {
            ws.send(JSON.stringify({ type: "ERROR", code: "FORBIDDEN", message: "Only GM can set track volume." }));
          } catch {
          }
          break;
        }
        const roomId = u.roomId;
        const vol = Math.max(0, Math.min(1, Number(data.volume)));
        const rs = this.roomState.get(roomId) || {};
        rs.trackVolume = vol;
        this.roomState.set(roomId, rs);
        console.log("[RoomHub] SET_TRACK_VOLUME_REQUEST", { roomId, vol });
        const payload = JSON.stringify({ type: "SET_TRACK_VOLUME", volume: vol });
        for (const [sock, uu] of this.clients) if (uu.roomId === roomId) {
          try {
            sock.send(payload);
          } catch {
          }
        }
        break;
      }
      case "SET_AUTOPLAY_REQUEST": {
        const u = this.clients.get(ws);
        if (!u) return;
        if (u.role !== "GM") {
          try {
            ws.send(JSON.stringify({ type: "ERROR", code: "FORBIDDEN", message: "Only GM can set autoplay." }));
          } catch {
          }
          ;
          break;
        }
        const roomId = u.roomId;
        const val = !!data.value;
        const rs = this.roomState.get(roomId) || {};
        rs.autoplay = val;
        this.roomState.set(roomId, rs);
        console.log("[RoomHub] SET_AUTOPLAY_REQUEST", { roomId, val });
        const payload = JSON.stringify({ type: "SET_AUTOPLAY", value: val });
        for (const [sock, uu] of this.clients) if (uu.roomId === roomId) {
          try {
            sock.send(payload);
          } catch {
          }
        }
        break;
      }
      // Future commands (Phase 2/3): PLAY, QUEUE_SECTION, etc. go here.
      default:
        console.log("[RoomHub] unknown type:", data.type);
        break;
    }
  }
  webSocketClose(ws, code, reason, wasClean) {
    const u = this.clients.get(ws);
    console.log("[RoomHub] close:", { code, reason, wasClean, hadUser: !!u });
    if (!u) return;
    const roomId = u.roomId;
    this.clients.delete(ws);
    console.log("[RoomHub] removed user on close. size:", this.clients.size);
    this.broadcastPresence(roomId);
  }
  webSocketError(ws, err) {
    console.log("[RoomHub] error:", err);
    try {
      ws.close(1011, "unexpected error");
    } catch {
    }
    const u = this.clients.get(ws);
    if (!u) return;
    const roomId = u.roomId;
    this.clients.delete(ws);
    this.broadcastPresence(roomId);
  }
  broadcastPresence(roomId) {
    const users = [];
    for (const [, u] of this.clients) {
      if (u.roomId === roomId) {
        users.push({ id: u.id, name: u.name, role: u.role, ready: u.ready });
      }
    }
    console.log("[RoomHub] PRESENCE \u2192", roomId, "users:", users.map((u) => u.name));
    const payload = JSON.stringify({ type: "PRESENCE", users });
    for (const [socket, u] of this.clients) {
      if (u.roomId === roomId) {
        try {
          socket.send(payload);
        } catch {
        }
      }
    }
  }
};
function json(obj, init = {}) {
  return new Response(JSON.stringify(obj), {
    headers: { "content-type": "application/json; charset=utf-8" },
    ...init
  });
}
__name(json, "json");
export {
  RoomHub,
  index_default as default
};
//# sourceMappingURL=index.js.map
