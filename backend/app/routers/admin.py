import uuid

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_models import User
from app.auth_schemas import UserResponse
from app.auth_utils import decode_token
from app.datamanager_database import get_dm_db

router = APIRouter(prefix="/admin", tags=["admin"])


async def require_admin(authorization: str = Header(...)) -> dict:
    try:
        token = authorization.removeprefix("Bearer ")
        payload = decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    return payload


@router.get("/users/pending", response_model=list[UserResponse])
async def list_pending(
    db: AsyncSession = Depends(get_dm_db),
    _: dict = Depends(require_admin),
):
    result = await db.execute(
        select(User).where(User.status == "pending_approval", User.deleted_at.is_(None))
        .order_by(User.created_at.asc())
    )
    return result.scalars().all()


@router.get("/users", response_model=list[UserResponse])
async def list_all_users(
    db: AsyncSession = Depends(get_dm_db),
    _: dict = Depends(require_admin),
):
    result = await db.execute(
        select(User).where(User.deleted_at.is_(None)).order_by(User.created_at.desc())
    )
    return result.scalars().all()


@router.post("/users/{user_id}/approve", response_model=UserResponse)
async def approve_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_dm_db),
    _: dict = Depends(require_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    user.status = "active"
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/users/{user_id}/reject", response_model=UserResponse)
async def reject_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_dm_db),
    _: dict = Depends(require_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    user.status = "rejected"
    await db.commit()
    await db.refresh(user)
    return user
