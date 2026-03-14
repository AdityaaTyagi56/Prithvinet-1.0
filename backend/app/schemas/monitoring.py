from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime
from app.models.monitoring import SourceType

class SensorReadingIngest(BaseModel):
    location_id: str
    parameter: str
    value: float
    source: str

class SensorReadingResponse(BaseModel):
    id: UUID
    location_id: UUID
    parameter_id: UUID
    value: float
    unit_id: UUID
    recorded_at: datetime
    source: SourceType
    quality_flag: Optional[str] = None

    class Config:
        from_attributes = True
