from __future__ import annotations

from fastapi import WebSocket
from starlette.websockets import WebSocketState


class ConnectionManager:
    def __init__(self):
        # Room based connection management
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, room: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.setdefault(room, []).append(websocket)

    def disconnect(self, room: str, websocket: WebSocket):
        connections = self.active_connections.get(room)
        if not connections:
            return
        if websocket in connections:
            connections.remove(websocket)
        if not connections:
            self.active_connections.pop(room, None)

    async def broadcast(self, room: str, message: dict):
        connections = list(self.active_connections.get(room, []))
        if not connections:
            return

        stale_connections: list[WebSocket] = []
        for connection in connections:
            try:
                if connection.application_state == WebSocketState.DISCONNECTED:
                    stale_connections.append(connection)
                    continue
                await connection.send_json(message)
            except Exception as exc:
                print(f"Error sending message to {room}: {exc}")
                stale_connections.append(connection)

        for connection in stale_connections:
            self.disconnect(room, connection)


manager = ConnectionManager()
