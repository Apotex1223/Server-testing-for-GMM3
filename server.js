import http from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.PORT) || 8080;
const HOST = "0.0.0.0";
const PING_INTERVAL_MS = 30_000;
const MAX_MOVES_PER_SECOND = 30;
const MAX_ROOM_ID_LENGTH = 64;
const MAX_NAME_LENGTH = 32;

/** roomId -> Map(playerId -> {ws, name, x, y, z, rotY}) */
const rooms = new Map();

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

const wss = new WebSocketServer({ server, maxPayload: 4096 });

function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function broadcast(room, message, exceptId) {
  const data = JSON.stringify(message);
  for (const [id, player] of room) {
    if (id !== exceptId && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(data);
    }
  }
}

function publicPlayer(id, p) {
  return { id, name: p.name, x: p.x, y: p.y, z: p.z, rotY: p.rotY };
}

function isNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function removePlayer(ws) {
  const { roomId, playerId } = ws;
  if (!roomId) return;
  ws.roomId = null;

  const room = rooms.get(roomId);
  if (!room || !room.delete(playerId)) return;

  broadcast(room, { type: "player_left", playerId });
  if (room.size === 0) rooms.delete(roomId);
  console.log(`player ${playerId} left room ${roomId}`);
}

function handleJoin(ws, msg) {
  const { roomId } = msg;
  if (typeof roomId !== "string" || roomId.length === 0 || roomId.length > MAX_ROOM_ID_LENGTH) {
    return send(ws, { type: "error", message: "roomId must be a non-empty string (max 64 chars)" });
  }
  if (msg.name !== undefined && typeof msg.name !== "string") {
    return send(ws, { type: "error", message: "name must be a string" });
  }
  const name = (msg.name ?? "").trim().slice(0, MAX_NAME_LENGTH) || "Player";

  // Re-joining switches rooms.
  removePlayer(ws);

  let room = rooms.get(roomId);
  if (!room) {
    room = new Map();
    rooms.set(roomId, room);
  }

  const player = { ws, name, x: 0, y: 0, z: 0, rotY: 0 };
  const others = [...room].map(([id, p]) => publicPlayer(id, p));
  room.set(ws.playerId, player);
  ws.roomId = roomId;

  send(ws, { type: "joined", playerId: ws.playerId, players: others });
  broadcast(room, { type: "player_joined", player: publicPlayer(ws.playerId, player) }, ws.playerId);
  console.log(`player ${ws.playerId} joined room ${roomId} (${room.size} in room)`);
}

function allowMove(ws) {
  const now = Date.now();
  if (now - ws.moveWindowStart >= 1000) {
    ws.moveWindowStart = now;
    ws.moveCount = 0;
  }
  ws.moveCount += 1;
  return ws.moveCount <= MAX_MOVES_PER_SECOND;
}

function handleMove(ws, msg) {
  if (!ws.roomId) return; // not joined
  if (!allowMove(ws)) return; // rate limited: drop

  const { x, y, z, rotY } = msg;
  if (![x, y, z, rotY].every(isNumber)) {
    return send(ws, { type: "error", message: "x, y, z and rotY must be finite numbers" });
  }

  const room = rooms.get(ws.roomId);
  const player = room?.get(ws.playerId);
  if (!player) return;

  Object.assign(player, { x, y, z, rotY });
  broadcast(room, { type: "player_moved", playerId: ws.playerId, x, y, z, rotY }, ws.playerId);
}

wss.on("connection", (ws) => {
  ws.playerId = randomUUID();
  ws.roomId = null;
  ws.isAlive = true;
  ws.moveWindowStart = 0;
  ws.moveCount = 0;
  console.log(`connected: ${ws.playerId} (${wss.clients.size} connections)`);

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      return send(ws, { type: "error", message: "binary messages are not supported" });
    }

    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return send(ws, { type: "error", message: "invalid JSON" });
    }
    if (msg === null || typeof msg !== "object" || typeof msg.type !== "string") {
      return send(ws, { type: "error", message: 'message must be an object with a string "type"' });
    }

    try {
      switch (msg.type) {
        case "join":
          return handleJoin(ws, msg);
        case "move":
          return handleMove(ws, msg);
        case "leave":
          return removePlayer(ws);
        default:
          return send(ws, { type: "error", message: `unknown message type: ${msg.type}` });
      }
    } catch (err) {
      console.error("error handling message:", err.message);
      send(ws, { type: "error", message: "internal error" });
    }
  });

  ws.on("close", () => {
    removePlayer(ws);
    console.log(`disconnected: ${ws.playerId}`);
  });

  ws.on("error", (err) => {
    console.error(`socket error for ${ws.playerId}:`, err.message);
  });
});

// Heartbeat: terminate sockets that did not answer the previous ping.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      console.log(`terminating unresponsive connection: ${ws.playerId}`);
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, PING_INTERVAL_MS);

server.listen(PORT, HOST, () => {
  console.log(`server listening on ${HOST}:${PORT}`);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down");
  clearInterval(heartbeat);
  for (const ws of wss.clients) ws.close(1001, "server shutting down");
  wss.close();
  server.close(() => {
    console.log("server closed");
    process.exit(0);
  });
  // Force exit if connections linger.
  setTimeout(() => process.exit(0), 5000).unref();
});
