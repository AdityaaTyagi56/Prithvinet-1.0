from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.redis import pubsub_manager
import asyncio

router = APIRouter(prefix="/ws", tags=["WebSockets"])

@router.websocket("/readings/{location_id}")
async def websocket_readings(websocket: WebSocket, location_id: str):
    await websocket.accept()
    pubsub = await pubsub_manager.subscribe(f"readings:{location_id}")
    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message:
                await websocket.send_text(message["data"])
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        await pubsub.unsubscribe(f"readings:{location_id}")
    except Exception as e:
        print(f"WebSocket error: {e}")
        await pubsub.unsubscribe(f"readings:{location_id}")

@router.websocket("/alerts")
async def websocket_alerts(websocket: WebSocket, region_id: str = None):
    await websocket.accept()
    channel = f"alerts:region:{region_id}" if region_id else "alerts:global"
    pubsub = await pubsub_manager.subscribe(channel)
    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message:
                await websocket.send_text(message["data"])
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        await pubsub.unsubscribe(channel)
    except Exception as e:
        print(f"WebSocket error: {e}")
        await pubsub.unsubscribe(channel)
