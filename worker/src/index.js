// src/index.js

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return json({ ok: true, worker: "wizamp-worker" });
    }

    if (url.pathname === "/ws") {
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
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    // Accept the socket into this Durable Object
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server, ["wizamp"]); // optional subprotocol

    return new Response(null, { status: 101, webSocket: client });
  }

  // ---- WebSocket lifecycle handlers ----
  webSocketMessage(ws, message) {
    let data;
    try {
      data =
        typeof message === "string" ? JSON.parse(message) :
        JSON.parse(new TextDecoder().decode(message));
    } catch {
      return;
    }

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
        this.broadcastPresence(user.roomId);
        break;
      }

      case "SET_READY": {
        const u = this.clients.get(ws);
        if (!u) return;
        u.ready = !!data.ready;
        this.broadcastPresence(u.roomId);
        break;
      }

      // Future commands (Phase 2/3): PLAY, QUEUE_SECTION, etc. go here.
      default:
        break;
    }
  }

  webSocketClose(ws, code, reason, wasClean) {
    const u = this.clients.get(ws);
    if (!u) return;
    const roomId = u.roomId;
    this.clients.delete(ws);
    this.broadcastPresence(roomId);
  }

  webSocketError(ws, err) {
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
