# Godot 4 network client

`NetClient.gd` is a minimal Godot 4 client for the WebSocket server in `server.js`. It speaks the JSON protocol over `wss://server-testing-for-gmm3-production.up.railway.app`.

## Setup

1. Copy `NetClient.gd` into your Godot project.
2. Open Project > Project Settings > Autoload.
3. Select `NetClient.gd` as the path, set the node name to `Net`, and click Add.

## Usage

```gdscript
func _ready() -> void:
	Net.joined.connect(func(my_id, players): print("joined as ", my_id, " with ", players))
	Net.player_joined.connect(func(p): print("player joined: ", p))
	Net.player_moved.connect(func(id, pos, rot_y): print(id, " moved to ", pos, " rotY ", rot_y))
	Net.player_left.connect(func(id): print("player left: ", id))
	Net.connect_to_room("test", "tester")

func _physics_process(_delta: float) -> void:
	Net.send_move(global_position, rotation.y)
```

Call `Net.leave()` to leave the room.
