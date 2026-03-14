from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from app.models.core import IndustryStatus, LocationType, LimitType

class RegionalOfficeBase(BaseModel):
    name: str
    district: str
    state: str
    coordinates: Optional[str] = None
    officer_id: Optional[UUID] = None

class RegionalOfficeCreate(RegionalOfficeBase):
    pass

class RegionalOfficeResponse(RegionalOfficeBase):
    id: UUID
    class Config:
        from_attributes = True

class IndustryBase(BaseModel):
    name: str
    type: str
    registration_no: str
    location: Optional[str] = None
    region_office_id: Optional[UUID] = None
    status: IndustryStatus = IndustryStatus.active

class IndustryCreate(IndustryBase):
    pass

class IndustryResponse(IndustryBase):
    id: UUID
    class Config:
        from_attributes = True

class MonitoringLocationBase(BaseModel):
    name: str
    location: Optional[str] = None
    type: LocationType
    industry_id: Optional[UUID] = None
    region_id: Optional[UUID] = None
    iot_device_id: Optional[str] = None
    is_active: bool = True

class MonitoringLocationCreate(MonitoringLocationBase):
    pass

class MonitoringLocationResponse(MonitoringLocationBase):
    id: UUID
    class Config:
        from_attributes = True

class PrescribedLimitBase(BaseModel):
    parameter_id: UUID
    industry_type: str
    limit_value: float
    limit_type: LimitType
    effective_from: Optional[str] = None

class PrescribedLimitCreate(PrescribedLimitBase):
    pass

class PrescribedLimitResponse(PrescribedLimitBase):
    id: UUID
    class Config:
        from_attributes = True
