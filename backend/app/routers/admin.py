import uuid
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_models import User
from app.auth_schemas import UserResponse
from app.auth_utils import decode_token, hash_password
from app.datamanager_database import get_dm_db
from app.access_models import DbAccessRequest, DbAccessGrant, PgDatabase, PgTableCatalog

router = APIRouter(prefix="/admin", tags=["admin"])


async def _enrich_request(req: DbAccessRequest, db: AsyncSession) -> dict:
    """Return user_email, db_name, tbl_name for any request."""
    user_email = None
    db_name = None
    tbl_name = None

    u = await db.execute(select(User).where(User.id == req.user_id))
    user_obj = u.scalar_one_or_none()
    if user_obj:
        user_email = user_obj.email

    if req.database_id:
        r = await db.execute(select(PgDatabase).where(PgDatabase.id == req.database_id))
        pg_db = r.scalar_one_or_none()
        db_name = pg_db.name if pg_db else None

    if req.table_id:
        r = await db.execute(select(PgTableCatalog).where(PgTableCatalog.id == req.table_id))
        tbl = r.scalar_one_or_none()
        if tbl:
            tbl_name = tbl.table_name
            if not db_name:  # table-scope: resolve db name via table's database_id
                r2 = await db.execute(select(PgDatabase).where(PgDatabase.id == tbl.database_id))
                pg_db2 = r2.scalar_one_or_none()
                db_name = pg_db2.name if pg_db2 else None

    return {"user_email": user_email, "db_name": db_name, "tbl_name": tbl_name}


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


# ── Access Request Management ─────────────────────────────────────────────────

class AccessRequestAdminResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_email: Optional[str] = None
    scope_type: str
    database_id: Optional[uuid.UUID] = None
    table_id: Optional[uuid.UUID] = None
    database_name: Optional[str] = None
    table_name: Optional[str] = None
    justification: Optional[str] = None
    duration_hours: Optional[int] = None
    status: str
    created_at: datetime


@router.get("/access-requests", response_model=list[AccessRequestAdminResponse])
async def list_access_requests(
    db: AsyncSession = Depends(get_dm_db),
    admin: dict = Depends(require_admin),
):
    result = await db.execute(
        select(DbAccessRequest)
        .where(DbAccessRequest.status == "pending")
        .order_by(DbAccessRequest.created_at.asc())
    )
    reqs = result.scalars().all()

    out = []
    for req in reqs:
        e = await _enrich_request(req, db)
        out.append(AccessRequestAdminResponse(
            id=req.id, user_id=req.user_id, user_email=e["user_email"],
            scope_type=req.scope_type, database_id=req.database_id,
            table_id=req.table_id, database_name=e["db_name"], table_name=e["tbl_name"],
            justification=req.justification, duration_hours=req.duration_hours,
            status=req.status, created_at=req.created_at,
        ))
    return out


@router.post("/access-requests/{request_id}/approve", response_model=AccessRequestAdminResponse)
async def approve_access_request(
    request_id: uuid.UUID,
    db: AsyncSession = Depends(get_dm_db),
    admin: dict = Depends(require_admin),
):
    result = await db.execute(select(DbAccessRequest).where(DbAccessRequest.id == request_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Access request not found.")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}.")

    admin_user_id = uuid.UUID(admin["sub"])
    req.status = "approved"
    req.reviewed_by = admin_user_id
    req.reviewed_at = datetime.now(timezone.utc)

    expires_at = None
    if req.duration_hours:
        expires_at = datetime.now(timezone.utc) + timedelta(hours=req.duration_hours)

    # Upsert: if active grants already exist for this user+resource, update the latest one
    # and revoke any older duplicates
    existing_grants_q = (
        select(DbAccessGrant)
        .where(
            DbAccessGrant.user_id == req.user_id,
            DbAccessGrant.scope_type == req.scope_type,
            DbAccessGrant.revoked_at.is_(None),
            DbAccessGrant.database_id == req.database_id if req.scope_type == "database"
            else DbAccessGrant.table_id == req.table_id,
        )
        .order_by(DbAccessGrant.granted_at.desc())
    )
    all_grants = (await db.execute(existing_grants_q)).scalars().all()
    existing_grant = all_grants[0] if all_grants else None

    # Revoke any duplicate older grants
    for old in all_grants[1:]:
        old.revoked_at = datetime.now(timezone.utc)

    if existing_grant:
        existing_grant.expires_at = expires_at
        existing_grant.granted_at = datetime.now(timezone.utc)
        existing_grant.granted_by = admin_user_id
        existing_grant.source_request_id = req.id
    else:
        grant = DbAccessGrant(
            user_id=req.user_id,
            scope_type=req.scope_type,
            database_id=req.database_id,
            table_id=req.table_id,
            source_request_id=req.id,
            granted_by=admin_user_id,
            expires_at=expires_at,
        )
        db.add(grant)

    await db.commit()
    await db.refresh(req)

    e = await _enrich_request(req, db)
    return AccessRequestAdminResponse(
        id=req.id, user_id=req.user_id, user_email=e["user_email"],
        scope_type=req.scope_type, database_id=req.database_id,
        table_id=req.table_id, database_name=e["db_name"], table_name=e["tbl_name"],
        justification=req.justification, duration_hours=req.duration_hours,
        status=req.status, created_at=req.created_at,
    )


@router.get("/access-requests/history", response_model=list[AccessRequestAdminResponse])
async def list_access_request_history(
    db: AsyncSession = Depends(get_dm_db),
    admin: dict = Depends(require_admin),
):
    result = await db.execute(
        select(DbAccessRequest)
        .where(DbAccessRequest.status.in_(["approved", "rejected"]))
        .order_by(DbAccessRequest.created_at.desc())
    )
    reqs = result.scalars().all()

    out = []
    for req in reqs:
        e = await _enrich_request(req, db)
        out.append(AccessRequestAdminResponse(
            id=req.id, user_id=req.user_id, user_email=e["user_email"],
            scope_type=req.scope_type, database_id=req.database_id,
            table_id=req.table_id, database_name=e["db_name"], table_name=e["tbl_name"],
            justification=req.justification, duration_hours=req.duration_hours,
            status=req.status, created_at=req.created_at,
        ))
    return out


@router.post("/access-requests/{request_id}/reject", response_model=AccessRequestAdminResponse)
async def reject_access_request(
    request_id: uuid.UUID,
    db: AsyncSession = Depends(get_dm_db),
    admin: dict = Depends(require_admin),
):
    result = await db.execute(select(DbAccessRequest).where(DbAccessRequest.id == request_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Access request not found.")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}.")

    admin_user_id = uuid.UUID(admin["sub"])
    req.status = "rejected"
    req.reviewed_by = admin_user_id
    req.reviewed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(req)

    e = await _enrich_request(req, db)
    return AccessRequestAdminResponse(
        id=req.id, user_id=req.user_id, user_email=e["user_email"],
        scope_type=req.scope_type, database_id=req.database_id,
        table_id=req.table_id, database_name=e["db_name"], table_name=e["tbl_name"],
        justification=req.justification, duration_hours=req.duration_hours,
        status=req.status, created_at=req.created_at,
    )


# ── Password Reset Management ──────────────────────────────────────────────────

class PasswordResetRequest(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_email: Optional[str] = None
    status: str
    created_at: datetime


class SetPasswordPayload(BaseModel):
    new_password: str


@router.get("/password-resets", response_model=list[PasswordResetRequest])
async def list_password_resets(
    db: AsyncSession = Depends(get_dm_db),
    _: dict = Depends(require_admin),
):
    result = await db.execute(
        text("SELECT id, user_id, status, created_at FROM password_reset_requests WHERE status = 'pending' ORDER BY created_at ASC")
    )
    rows = result.mappings().all()
    out = []
    for row in rows:
        u = await db.execute(select(User).where(User.id == row["user_id"]))
        user_obj = u.scalar_one_or_none()
        out.append(PasswordResetRequest(
            id=row["id"],
            user_id=row["user_id"],
            user_email=user_obj.email if user_obj else None,
            status=row["status"],
            created_at=row["created_at"],
        ))
    return out


@router.post("/password-resets/{reset_id}/resolve")
async def resolve_password_reset(
    reset_id: uuid.UUID,
    payload: SetPasswordPayload,
    db: AsyncSession = Depends(get_dm_db),
    admin: dict = Depends(require_admin),
):
    row = await db.execute(
        text("SELECT id, user_id, status FROM password_reset_requests WHERE id = :rid"),
        {"rid": str(reset_id)},
    )
    reset = row.mappings().one_or_none()
    if not reset:
        raise HTTPException(status_code=404, detail="Reset request not found.")
    if reset["status"] != "pending":
        raise HTTPException(status_code=400, detail="Request already resolved.")

    u = await db.execute(select(User).where(User.id == reset["user_id"]))
    user_obj = u.scalar_one_or_none()
    if not user_obj:
        raise HTTPException(status_code=404, detail="User not found.")
    user_obj.password_hash = hash_password(payload.new_password)

    admin_user_id = uuid.UUID(admin["sub"])
    await db.execute(
        text("UPDATE password_reset_requests SET status = 'resolved', resolved_by = :by, resolved_at = now() WHERE id = :rid"),
        {"by": str(admin_user_id), "rid": str(reset_id)},
    )
    await db.commit()
    return {"detail": "Password updated successfully."}
