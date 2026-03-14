from typing import List, Optional

import jwt
from app.core.config import settings
from app.core.database import get_db
from app.models.users import User, UserRole
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=True)
oauth2_scheme_optional = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login", auto_error=False
)


async def _get_user_from_token(
    token: Optional[str], db: AsyncSession
) -> Optional[User]:
    """Decode JWT and return the User, or None if token is missing/invalid."""
    if not token:
        return None
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        if payload.get("type") == "refresh":
            return None
        user_id: str = payload.get("sub")
        if not user_id:
            return None
    except jwt.InvalidTokenError:
        return None

    # Check blacklist
    from app.core.redis import redis_client

    if await redis_client.get(f"jti:{token}"):
        return None

    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Require a valid authenticated user. Raises 401 if missing or invalid."""
    user = await _get_user_from_token(token, db)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def get_current_user_optional(
    token: Optional[str] = Depends(oauth2_scheme_optional),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Return the authenticated user if a valid token is provided, else None.
    Endpoints that use this dependency are accessible without authentication
    but can behave differently for authenticated users."""
    return await _get_user_from_token(token, db)


def role_required(allowed_roles: List[UserRole]):
    """Dependency factory — enforces that the current user has one of the
    specified roles.  Always requires a valid token (uses get_current_user)."""

    async def _check_role(
        current_user: User = Depends(get_current_user),
    ) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return current_user

    return _check_role
