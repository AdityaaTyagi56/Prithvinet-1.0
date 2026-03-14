from pydantic import BaseModel, EmailStr
from typing import Optional
from uuid import UUID
from app.models.users import UserRole

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: UserRole
    region_office_id: Optional[UUID] = None
    industry_id: Optional[UUID] = None

class UserResponse(BaseModel):
    id: UUID
    email: EmailStr
    role: UserRole
    region_office_id: Optional[UUID] = None
    industry_id: Optional[UUID] = None

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class LoginRequest(BaseModel):
    email: str
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str
