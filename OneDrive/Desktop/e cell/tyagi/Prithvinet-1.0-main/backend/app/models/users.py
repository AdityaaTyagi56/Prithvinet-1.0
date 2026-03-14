from sqlalchemy import Column, String, Enum, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum
from app.models.base import BaseModel

class UserRole(str, enum.Enum):
    super_admin = "super_admin"
    regional_officer = "regional_officer"
    monitoring_team = "monitoring_team"
    industry_user = "industry_user"
    citizen = "citizen"

class User(BaseModel):
    __tablename__ = "users"
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(Enum(UserRole), nullable=False)
    region_office_id = Column(UUID(as_uuid=True), ForeignKey("regional_offices.id"), nullable=True)
    industry_id = Column(UUID(as_uuid=True), ForeignKey("industries.id"), nullable=True)

class RefreshToken(BaseModel):
    __tablename__ = "refresh_tokens"
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    token_hash = Column(String, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
