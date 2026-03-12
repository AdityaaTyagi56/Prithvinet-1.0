from sqlalchemy import Column, String, Float, ForeignKey, Boolean, Enum
from sqlalchemy.dialects.postgresql import UUID
import enum
from app.models.base import BaseModel

class RegionalOffice(BaseModel):
    __tablename__ = "regional_offices"
    name = Column(String, nullable=False)
    district = Column(String, nullable=False)
    state = Column(String, nullable=False)
    coordinates = Column(String, nullable=True)
    officer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

class IndustryStatus(str, enum.Enum):
    active = "active"
    suspended = "suspended"

class Industry(BaseModel):
    __tablename__ = "industries"
    name = Column(String, nullable=False, index=True)
    type = Column(String, nullable=False)
    registration_no = Column(String, unique=True, index=True)
    location = Column(String, nullable=True)
    region_office_id = Column(UUID(as_uuid=True), ForeignKey("regional_offices.id"))
    status = Column(Enum(IndustryStatus), default=IndustryStatus.active)

class WaterSource(BaseModel):
    __tablename__ = "water_sources"
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    location = Column(String, nullable=True)
    region_office_id = Column(UUID(as_uuid=True), ForeignKey("regional_offices.id"))

class LocationType(str, enum.Enum):
    air = "air"
    water = "water"
    noise = "noise"

class MonitoringLocation(BaseModel):
    __tablename__ = "monitoring_locations"
    name = Column(String, nullable=False)
    location = Column(String, nullable=True)
    type = Column(Enum(LocationType), nullable=False)
    industry_id = Column(UUID(as_uuid=True), ForeignKey("industries.id"), nullable=True)
    region_id = Column(UUID(as_uuid=True), ForeignKey("regional_offices.id"), nullable=True)
    iot_device_id = Column(String, unique=True, index=True, nullable=True)
    is_active = Column(Boolean, default=True)

class MonitoringUnit(BaseModel):
    __tablename__ = "monitoring_units"
    parameter = Column(String, nullable=False, index=True)
    unit = Column(String, nullable=False)
    description = Column(String, nullable=True)

class LimitType(str, enum.Enum):
    max = "max"
    min = "min"

class PrescribedLimit(BaseModel):
    __tablename__ = "prescribed_limits"
    parameter_id = Column(UUID(as_uuid=True), ForeignKey("monitoring_units.id"), nullable=False)
    industry_type = Column(String, nullable=False)
    limit_value = Column(Float, nullable=False)
    limit_type = Column(Enum(LimitType), nullable=False)
    effective_from = Column(String, nullable=True)
