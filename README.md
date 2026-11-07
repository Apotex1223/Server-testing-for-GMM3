# Server-testing-for-GMM3

A small WebSocket multiplayer server for a Godot 4 Android proof of concept. Clients join named rooms, send their position and rotation, and receive the positions of the other players in the same room. State is held in memory only.

## Run locally

```
npm install
npm start
```

The server listens on `0.0.0.0` at `process.env.PORT` (default `8080`). Connect with `ws://localhost:8080`. On Railway, TLS is terminated at the edge, so clients use `wss://`.

## Health check

`GET /health` returns `200` with the body `ok`. Any other HTTP request returns `404`.

## Protocol

All messages are JSON objects with a `type` field.

Client to server:

- `{"type":"join","roomId":"abc","name":"Alice"}` joins a room, creating it if needed.
- `{"type":"move","x":0,"y":0,"z":0,"rotY":0}` updates your state. Ignored until you have joined. Limited to 30 per second per player; extras are dropped.
- `{"type":"leave"}` leaves the current room. Closing the socket does the same.

Server to client:

- `{"type":"joined","playerId":"...","players":[...]}` is sent to the joining client with the players already in the room.
- `{"type":"player_joined","player":{...}}` is broadcast to the others in the room.
- `{"type":"player_moved","playerId":"...","x":0,"y":0,"z":0,"rotY":0}` is broadcast to the others in the room.
- `{"type":"player_left","playerId":"..."}` is broadcast when a player leaves or disconnects.
- `{"type":"error","message":"..."}` is sent on invalid input.

A player object looks like `{"id":"...","name":"Alice","x":0,"y":0,"z":0,"rotY":0}`.

The server pings every client every 30 seconds and terminates connections that did not respond to the previous ping.
