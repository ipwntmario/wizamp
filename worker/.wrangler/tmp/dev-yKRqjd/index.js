var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-gm4QEf/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// src/index.js
var src_default = {
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

// ../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-gm4QEf/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-gm4QEf/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  RoomHub,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
