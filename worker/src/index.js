// src/index.js

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return json({ ok: true, worker: "wizamp-worker" });
    }

    if (url.pathname === "/ws") {
      // Log to confirm we’re receiving the Upgrade request
      console.log("[worker] /ws request headers:", Object.fromEntries(req.headers));

      if (req.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }

      // Forward the WebSocket upgrade to our Durable Object "hub".
      const id = env.ROOM_HUB.idFromName("hub"); // single DO that manages many rooms
      const stub = env.ROOM_HUB.get(id);
      return stub.fetch(req);
    }

    return new Response("Not found", { status: 404 });
  },
};

export class RoomHub {
  /** @param {DurableObjectState} state */
  constructor(state, env) {
    this.state = state;
    this.env = env;
    // Map<WebSocket, {id,name,role,ready,roomId}>
    this.clients = new Map();
  }

  async fetch(req) {
    // Only accept WS upgrades here
    const upgrade = req.headers.get("Upgrade");
    console.log("[RoomHub] fetch upgrade:", upgrade);
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server); // no subprotocol here
    console.log("[RoomHub] accepted websocket");
    // Important for Miniflare: do not force status:101; just attach the socket.
    return new Response(null, {
      status: 101,            // Required in Miniflare
      webSocket: client
    });
  }

  // ---- WebSocket lifecycle handlers ----
  webSocketAccept(ws) {
    try { ws.send(JSON.stringify({ type: "WELCOME", serverTimeMs: Date.now() })); } catch {}
  }

  webSocketOpen(ws) {
    // DO-side confirmation that the socket is actually open
    try { ws.send(JSON.stringify({ type: "WELCOME", serverTimeMs: Date.now() })); } catch {}
    console.log("[RoomHub] open:", ws);
  }

  webSocketMessage(ws, message) {
    let data;
    try {
      data =
        typeof message === "string" ? JSON.parse(message) :
        JSON.parse(new TextDecoder().decode(message));
    } catch (e) {
      console.log("[RoomHub] message parse error:", e);
      return;
    }

    console.log("[RoomHub] message:", data);

    if (!data || typeof data !== "object") return;

    switch (data.type) {
      case "HELLO": {
        // Seed user record; roomId comes from HELLO
        const user = {
          id: crypto.randomUUID(),
          name: data.name || "Anon",
          role: data.role || "Player",
          ready: !!data.ready,
          roomId: data.roomId || "default",
        };
        this.clients.set(ws, user);
        console.log("[RoomHub] HELLO add:", user, "total:", this.clients.size);
        this.broadcastPresence(user.roomId);
        break;
      }

      case "SET_READY": {
        const u = this.clients.get(ws);
        if (!u) return;
        u.ready = !!data.ready;
        console.log("[RoomHub] SET_READY:", u.name, "→", u.ready);
        this.broadcastPresence(u.roomId);
        break;
      }

      case "PING": {
        // client -> server ping; reply immediately with server time (ms) and echo
        const u = this.clients.get(ws);
        if (!u) return;
        const payload = JSON.stringify({
          type: "PONG",
          serverTimeMs: Date.now(),
          echoClientMs: Number(data.clientMs) || 0,
        });
        try { ws.send(payload); } catch {}
        break;
      }

      case "PLAY_REQUEST": {
        // GM requests a synchronized section start across the room
        const u = this.clients.get(ws);
        if (!u) return;
        const roomId = u.roomId;
        const serverMs = Number(data.serverMs) || (Date.now() + 2000);
        const trackName = String(data.trackName || "");
        const sectionName = String(data.sectionName || "");
        const override = !!data.override;

        // (1) Only allow GM to request play
        if (u.role !== "GM") {
          try { ws.send(JSON.stringify({ type: "ERROR", code: "FORBIDDEN", message: "Only GM can play." })); } catch {}
          break;
        }

        // (2) Ready gate
        const usersInRoom = [];
        for (const [, ru] of this.clients) if (ru.roomId === roomId) usersInRoom.push(ru);
        const notReady = usersInRoom.filter(x => !x.ready).map(x => x.name);

        if (!override && notReady.length > 0) {
          console.log("[RoomHub] PLAY_REQUEST rejected (not ready):", notReady);
          try {
            ws.send(JSON.stringify({
              type: "ERROR",
              code: "NOT_READY",
              message: "Not all players are ready.",
              notReady
            }));
          } catch {}
          break;
        }

        console.log("[RoomHub] PLAY_REQUEST accepted", { roomId, trackName, sectionName, serverMs, override });
        const payload = JSON.stringify({ type: "PLAY", trackName, sectionName, serverMs });
        for (const [sock, uu] of this.clients) {
          if (uu.roomId === roomId) {
            try { sock.send(payload); } catch {}
          }
        }
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
    try { ws.close(1011, "unexpected error"); } catch {}
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
    console.log("[RoomHub] PRESENCE →", roomId, "users:", users.map(u => u.name));
    const payload = JSON.stringify({ type: "PRESENCE", users });
    for (const [socket, u] of this.clients) {
      if (u.roomId === roomId) {
        try { socket.send(payload); } catch {}
      }
    }
  }
}

// ---- helpers ----
function json(obj, init = {}) {
  return new Response(JSON.stringify(obj), {
    headers: { "content-type": "application/json; charset=utf-8" },
    ...init,
  });
}
