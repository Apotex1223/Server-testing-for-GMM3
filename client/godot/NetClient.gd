extends Node
signal joined(my_id, players)
signal player_joined(p)
signal player_moved(id, pos, rot_y)
signal player_left(id)
const URL := "wss://server-testing-for-gmm3-production.up.railway.app"
var ws := WebSocketPeer.new()
var _connected := false
var _pending = null
func connect_to_room(room: String, player_name: String) -> void:
	ws.connect_to_url(URL)
	_pending = {"type": "join", "roomId": room, "name": player_name}
func _process(_delta: float) -> void:
	ws.poll()
	var st := ws.get_ready_state()
	if st == WebSocketPeer.STATE_OPEN:
		if not _connected:
			_connected = true
			if _pending:
				send(_pending)
				_pending = null
		while ws.get_available_packet_count() > 0:
			_handle(JSON.parse_string(ws.get_packet().get_string_from_utf8()))
	elif st == WebSocketPeer.STATE_CLOSED:
		_connected = false
func send(d: Dictionary) -> void:
	if ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		ws.send_text(JSON.stringify(d))
func send_move(pos: Vector3, rot_y: float) -> void:
	send({"type": "move", "x": pos.x, "y": pos.y, "z": pos.z, "rotY": rot_y})
func leave() -> void:
	send({"type": "leave"})
func _handle(m) -> void:
	if typeof(m) != TYPE_DICTIONARY:
		return
	match m.get("type"):
		"joined": joined.emit(m.playerId, m.players)
		"player_joined": player_joined.emit(m.player)
		"player_moved": player_moved.emit(m.playerId, Vector3(m.x, m.y, m.z), m.rotY)
		"player_left": player_left.emit(m.playerId)
		"error": push_warning("server: " + str(m.get("message", "")))
