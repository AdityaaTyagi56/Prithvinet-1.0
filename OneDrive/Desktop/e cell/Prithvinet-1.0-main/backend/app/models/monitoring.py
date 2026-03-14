import uuid
from sqlalchemy import Column, String, Float, ForeignKey, DateTime, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import enum
from app.models.base import Base

class SourceType(str, enum.Enum):
    iot = "iot"
    manual = "manual"

class SensorReading(Base):
    __tablename__ = "sensor_readings"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("monitoring_locations.id"), nullable=False, index=True)
    parameter_id = Column(UUID(as_uuid=True), ForeignKey("monitoring_units.id"), nullable=False, index=True)
    value = Column(Float, nullable=False)
    unit_id = Column(UUID(as_uuid=True), ForeignKey("monitoring_units.id"), nullable=False)
    recorded_at = Column(DateTime(timezone=True), primary_key=True, default=func.now())
    source = Column(Enum(SourceType), nullable=False)
    quality_flag = Column(String, nullable=True)

class IndustrialMonitoringLog(Base):
    __tablename__ = "industrial_monitoring_logs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    industry_id = Column(UUID(as_uuid=True), ForeignKey("industries.id"), nullable=False)
    parameter_id = Column(UUID(as_uuid=True), ForeignKey("monitoring_units.id"), nullable=False)
    value = Column(Float, nullable=False)
    unit_id = Column(UUID(as_uuid=True), ForeignKey("monitoring_units.id"), nullable=False)
    reported_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    recorded_at = Column(DateTime(timezone=True), default=func.now())
    report_type = Column(String, nullable=False)

class MonitoringCampaign(Base):
    __tablename__ = "monitoring_campaigns"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    region_id = Column(UUID(as_uuid=True), ForeignKey("regional_offices.id"), nullable=False)
    start_date = Column(DateTime(timezone=True), nullable=False)
    end_date = Column(DateTime(timezone=True), nullable=False)
    frequency = Column(String, nullable=True)
    team_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

class CampaignReading(Base):
    __tablename__ = "campaign_readings"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("monitoring_campaigns.id"), nullable=False)
    location_id = Column(UUID(as_uuid=True), ForeignKey("monitoring_locations.id"), nullable=False)
    parameter_id = Column(UUID(as_uuid=True), ForeignKey("monitoring_units.id"), nullable=False)
    value = Column(Float, nullable=False)
    recorded_at = Column(DateTime(timezone=True), default=func.now())
    submitted_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

class PeriodicReport(Base):
    __tablename__ = "periodic_reports"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_type = Column(String, nullable=False)
    region_id = Column(UUID(as_uuid=True), ForeignKey("regional_offices.id"), nullable=False)
    period_start = Column(DateTime(timezone=True), nullable=False)
    period_end = Column(DateTime(timezone=True), nullable=False)
    pdf_url = Column(String, nullable=True)
    status = Column(String, nullable=False)
