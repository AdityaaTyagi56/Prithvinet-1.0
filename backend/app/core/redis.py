import redis.asyncio as redis
from app.core.config import settings

redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)

class PubSubManager:
    def __init__(self):
        self.redis = redis_client

    async def publish(self, channel: str, message: str):
        await self.redis.publish(channel, message)

    async def subscribe(self, channel: str):
        pubsub = self.redis.pubsub()
        await pubsub.subscribe(channel)
        return pubsub

pubsub_manager = PubSubManager()

