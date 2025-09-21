// wizamp-server/index.js
import express from "express";
import { WebSocketServer } from "ws";
import http from "http";

const app = express();
const server = http.createServer(app);

// --- REST healthcheck ---
app.get("/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// --- WebSocket ---
const wss = new WebSocketServer({ server, path: "/ws" });

// In-memory rooms
const rooms = {}; // { roomId: Map<socket, {name, role, ready}> }

wss.on("connection", (ws) => {
  let roomId = null;
  let userId = Math.random().toString(36).slice(2);

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.type === "HELLO") {
        roomId = data.roomId;
        if (!rooms[roomId]) rooms[roomId] = new Map();
        rooms[roomId].set(ws, {
          id: userId,
          name: data.name || "Anon",
          role: data.role || "Player",
          ready: !!data.ready,
        });
        broadcastPresence(roomId);
      }

      if (data.type === "SET_READY" && roomId) {
        const user = rooms[roomId].get(ws);
        if (user) {
          user.ready = !!data.ready;
          broadcastPresence(roomId);
        }
      }
    } catch (e) {
      console.error("Bad WS message:", msg);
    }
  });

  ws.on("close", () => {
    if (roomId && rooms[roomId]) {
      rooms[roomId].delete(ws);
      broadcastPresence(roomId);
    }
  });
});

function broadcastPresence(roomId) {
  if (!rooms[roomId]) return;
  const users = Array.from(rooms[roomId].values()).map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    ready: u.ready,
  }));
  const payload = JSON.stringify({ type: "PRESENCE", users });
  for (const sock of rooms[roomId].keys()) {
    sock.send(payload);
  }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Wizamp server listening on http://localhost:${PORT}`);
});
