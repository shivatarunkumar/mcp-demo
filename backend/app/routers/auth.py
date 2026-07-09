import uuid

from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_models import User
from app.auth_schemas import LoginResponse, RegisterRequest, LoginRequest, UserResponse
from app.auth_utils import hash_password, verify_password, create_access_token, decode_token
from app.datamanager_database import get_dm_db

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_dm_db)):
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered.")
    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        status="pending_approval",
        role="user",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_dm_db)):
    result = await db.execute(
        select(User).where(User.email == payload.email, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if user.status == "pending_approval":
        raise HTTPException(
            status_code=403,
            detail="Your account is pending approval by an administrator.",
        )
    if user.status == "rejected":
        raise HTTPException(status_code=403, detail="Your registration was not approved.")
    if user.status != "active":
        raise HTTPException(status_code=403, detail=f"Account is {user.status}.")
    token = create_access_token(str(user.id), user.role)
    return LoginResponse(access_token=token, user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
async def me(authorization: str = Header(...), db: AsyncSession = Depends(get_dm_db)):
    try:
        token = authorization.removeprefix("Bearer ")
        payload = decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    result = await db.execute(
        select(User).where(User.id == uuid.UUID(payload["sub"]))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user
