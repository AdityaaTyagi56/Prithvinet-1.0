from app.routers import (
    alerts,
    auth,
    copilot,
    forecast,
    industries,
    limits,
    locations,
    public,
    readings,
    regions,
    users,
    ws,
)
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="PrithviNet API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(regions.router, prefix="/api/v1")
app.include_router(industries.router, prefix="/api/v1")
app.include_router(locations.router, prefix="/api/v1")
app.include_router(limits.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(readings.router, prefix="/api/v1")
app.include_router(forecast.router, prefix="/api/v1")
app.include_router(copilot.router, prefix="/api/v1")
app.include_router(public.router, prefix="/api/v1")
app.include_router(alerts.router, prefix="/api/v1")
app.include_router(ws.router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
