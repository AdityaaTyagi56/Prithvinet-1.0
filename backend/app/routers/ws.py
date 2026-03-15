import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.redis import pubsub_manager

router = APIRouter(prefix="/ws", tags=["WebSockets"])

logger = logging.getLogger(__name__)


@router.websocket("/readings/{location_id}")
async def websocket_readings(websocket: WebSocket, location_id: str):
    await websocket.accept()
    channel = f"readings:{location_id}"
    pubsub = await pubsub_manager.subscribe(channel)
    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message:
                await websocket.send_text(message["data"])
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning("WebSocket readings error: %s", e)
    finally:
        await pubsub.unsubscribe(channel)


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
        pass
    except Exception as e:
        logger.warning("WebSocket alerts error: %s", e)
    finally:
        await pubsub.unsubscribe(channel)
