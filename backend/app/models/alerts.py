import uuid
from sqlalchemy import Column, String, Float, ForeignKey, DateTime, Enum, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
import enum
from app.models.base import BaseModel

class AlertType(str, enum.Enum):
    limit_breach = "limit_breach"
    missing_report = "missing_report"
    anomaly = "anomaly"
    rapid_rise = "rapid_rise"
    sensor_offline = "sensor_offline"

class AlertSeverity(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"

class AlertStatus(str, enum.Enum):
    open = "open"
    escalated = "escalated"
    resolved = "resolved"

class Alert(BaseModel):
    __tablename__ = "alerts"
    type = Column(Enum(AlertType), nullable=False)
    location_id = Column(UUID(as_uuid=True), ForeignKey("monitoring_locations.id"), nullable=True)
    industry_id = Column(UUID(as_uuid=True), ForeignKey("industries.id"), nullable=True, index=True)
    parameter_id = Column(UUID(as_uuid=True), ForeignKey("monitoring_units.id"), nullable=True)
    value = Column(Float, nullable=True)
    threshold = Column(Float, nullable=True)
    severity = Column(Enum(AlertSeverity), nullable=False, index=True)
    status = Column(Enum(AlertStatus), default=AlertStatus.open, index=True)

class AlertEscalation(BaseModel):
    __tablename__ = "alert_escalations"
    alert_id = Column(UUID(as_uuid=True), ForeignKey("alerts.id"), nullable=False)
    escalated_to = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    escalated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    escalated_at = Column(DateTime(timezone=True), default=func.now())
    notes = Column(String, nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

class ComplianceStatus(str, enum.Enum):
    compliant = "compliant"
    non_compliant = "non_compliant"
    pending = "pending"

class ComplianceRecord(BaseModel):
    __tablename__ = "compliance_records"
    industry_id = Column(UUID(as_uuid=True), ForeignKey("industries.id"), nullable=False)
    parameter_id = Column(UUID(as_uuid=True), ForeignKey("monitoring_units.id"), nullable=False)
    period = Column(String, nullable=False)
    status = Column(Enum(ComplianceStatus), nullable=False)
    violations_count = Column(Integer, default=0)
    last_checked = Column(DateTime(timezone=True), default=func.now())

class MissingReportReminder(BaseModel):
    __tablename__ = "missing_report_reminders"
    industry_id = Column(UUID(as_uuid=True), ForeignKey("industries.id"), nullable=False)
    report_type = Column(String, nullable=False)
    due_date = Column(DateTime(timezone=True), nullable=False)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)

class Forecast(BaseModel):
    __tablename__ = "forecasts"
    location_id = Column(UUID(as_uuid=True), ForeignKey("monitoring_locations.id"), nullable=False)
    parameter_id = Column(UUID(as_uuid=True), ForeignKey("monitoring_units.id"), nullable=False)
    horizon_hours = Column(Integer, nullable=False)
    point_forecast = Column(JSONB, nullable=False)
    lower_bound = Column(JSONB, nullable=False)
    upper_bound = Column(JSONB, nullable=False)
    model_version = Column(String, nullable=True)
