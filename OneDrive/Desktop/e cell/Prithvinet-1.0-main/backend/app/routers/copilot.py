from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.services.copilot_service import stream_copilot_response, get_session_history

router = APIRouter(prefix="/copilot", tags=["Copilot"])

class QueryRequest(BaseModel):
    session_id: str
    query: str

@router.post("/query")
async def copilot_query(request: QueryRequest):
    return StreamingResponse(
        stream_copilot_response(request.session_id, request.query),
        media_type="text/event-stream"
    )

@router.get("/history/{session_id}")
async def copilot_history(session_id: str):
    history = await get_session_history(session_id)
    return {"history": history}
