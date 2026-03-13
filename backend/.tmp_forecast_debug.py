import asyncio
import traceback
from sqlalchemy import text
from app.core.database import AsyncSessionLocal
from app.services.ml_service import generate_forecast

async def main():
    async with AsyncSessionLocal() as db:
        loc = (await db.execute(text("select id::text from monitoring_locations limit 1"))).scalar()
        pid = (await db.execute(text("select id::text from monitoring_units where parameter='PM2.5' limit 1"))).scalar()
        print('loc', loc, 'pid', pid)
        try:
            out = await generate_forecast(db, loc, pid, 72)
            print('ok', len(out))
            if out:
                print(out[0])
        except Exception as e:
            print('ERR', e)
            traceback.print_exc()

asyncio.run(main())
