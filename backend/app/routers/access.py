import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.access_models import DbAccessGrant, DbAccessRequest, PgDatabase, PgTableCatalog
from app.auth_utils import decode_token
from app.datamanager_database import get_dm_db

router = APIRouter(prefix="/access", tags=["access"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class TableStatus(BaseModel):
    id: uuid.UUID
    table_name: str
    description: str | None
    grant_status: str  # none | pending | granted

class DatabaseCatalog(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    grant_status: str  # none | pending | granted
    tables: list[TableStatus]

ALLOWED_DURATIONS = {2, 4, 8, 24}  # hours; None = permanent

class AccessRequestCreate(BaseModel):
    scope_type: str           # 'database' or 'table'
    database_id: uuid.UUID | None = None
    table_id: uuid.UUID | None = None
    justification: str | None = None
    duration_hours: int | None = None  # None = permanent/max

class AccessRequestResponse(BaseModel):
    id: uuid.UUID
    scope_type: str
    database_id: uuid.UUID | None
    table_id: uuid.UUID | None
    justification: str | None
    duration_hours: int | None
    status: str
    created_at: datetime
    database_name: str | None = None
    table_name: str | None = None
    expires_at: datetime | None = None

    model_config = {"from_attributes": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _resolve_names(req: DbAccessRequest, db) -> tuple[str | None, str | None]:
    """Return (db_name, table_name), resolving DB via table catalog for table-scope requests."""
    db_name = None
    tbl_name = None
    if req.database_id:
        r = await db.execute(select(PgDatabase).where(PgDatabase.id == req.database_id))
        pg_db = r.scalar_one_or_none()
        db_name = pg_db.name if pg_db else None
    if req.table_id:
        r = await db.execute(select(PgTableCatalog).where(PgTableCatalog.id == req.table_id))
        tbl = r.scalar_one_or_none()
        if tbl:
            tbl_name = tbl.table_name
            if not db_name:
                r2 = await db.execute(select(PgDatabase).where(PgDatabase.id == tbl.database_id))
                pg_db2 = r2.scalar_one_or_none()
                db_name = pg_db2.name if pg_db2 else None
    return db_name, tbl_name


async def _get_grant_expiry(req: DbAccessRequest, db) -> datetime | None:
    """Return expires_at from the most recent active grant for this request."""
    grant_result = await db.execute(
        select(DbAccessGrant)
        .where(DbAccessGrant.source_request_id == req.id)
        .order_by(DbAccessGrant.granted_at.desc())
    )
    grant = grant_result.scalars().first()
    return grant.expires_at if grant else None


def _parse_token(authorization: str) -> dict:
    try:
        token = authorization.removeprefix("Bearer ")
        return decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")


async def _user_grant_map(
    user_id: uuid.UUID, db: AsyncSession
) -> tuple[set[uuid.UUID], set[uuid.UUID]]:
    """Return (granted_db_ids, granted_table_ids) for active grants."""
    result = await db.execute(
        select(DbAccessGrant).where(
            DbAccessGrant.user_id == user_id,
            DbAccessGrant.revoked_at.is_(None),
        )
    )
    grants = result.scalars().all()
    db_ids = {g.database_id for g in grants if g.scope_type == "database" and g.database_id}
    tbl_ids = {g.table_id for g in grants if g.scope_type == "table" and g.table_id}
    return db_ids, tbl_ids


async def _user_pending_map(
    user_id: uuid.UUID, db: AsyncSession
) -> tuple[set[uuid.UUID], set[uuid.UUID]]:
    """Return (pending_db_ids, pending_table_ids) for pending requests."""
    result = await db.execute(
        select(DbAccessRequest).where(
            DbAccessRequest.user_id == user_id,
            DbAccessRequest.status == "pending",
        )
    )
    reqs = result.scalars().all()
    db_ids = {r.database_id for r in reqs if r.scope_type == "database" and r.database_id}
    tbl_ids = {r.table_id for r in reqs if r.scope_type == "table" and r.table_id}
    return db_ids, tbl_ids


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/catalog", response_model=list[DatabaseCatalog])
async def get_catalog(
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_dm_db),
):
    payload = _parse_token(authorization)
    user_id = uuid.UUID(payload["sub"])

    granted_dbs, granted_tbls = await _user_grant_map(user_id, db)
    pending_dbs, pending_tbls = await _user_pending_map(user_id, db)

    dbs_result = await db.execute(
        select(PgDatabase).where(PgDatabase.is_active.is_(True)).order_by(PgDatabase.name)
    )
    databases = dbs_result.scalars().all()

    catalog = []
    for database in databases:
        if database.id in granted_dbs:
            db_status = "granted"
        elif database.id in pending_dbs:
            db_status = "pending"
        else:
            db_status = "none"

        tbls_result = await db.execute(
            select(PgTableCatalog).where(
                PgTableCatalog.database_id == database.id,
                PgTableCatalog.is_active.is_(True),
            ).order_by(PgTableCatalog.table_name)
        )
        tables = tbls_result.scalars().all()

        table_statuses = []
        for t in tables:
            if t.id in granted_tbls or database.id in granted_dbs:
                t_status = "granted"
            elif t.id in pending_tbls:
                t_status = "pending"
            else:
                t_status = "none"
            table_statuses.append(
                TableStatus(id=t.id, table_name=t.table_name, description=t.description, grant_status=t_status)
            )

        catalog.append(
            DatabaseCatalog(
                id=database.id,
                name=database.name,
                description=database.description,
                grant_status=db_status,
                tables=table_statuses,
            )
        )

    return catalog


@router.post("/request", response_model=AccessRequestResponse, status_code=201)
async def create_request(
    payload_in: AccessRequestCreate,
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_dm_db),
):
    payload = _parse_token(authorization)
    user_id = uuid.UUID(payload["sub"])

    if payload_in.scope_type not in ("database", "table"):
        raise HTTPException(status_code=400, detail="scope_type must be 'database' or 'table'.")
    if payload_in.scope_type == "database" and not payload_in.database_id:
        raise HTTPException(status_code=400, detail="database_id required for database scope.")
    if payload_in.scope_type == "table" and not payload_in.table_id:
        raise HTTPException(status_code=400, detail="table_id required for table scope.")
    if payload_in.duration_hours is not None and payload_in.duration_hours not in ALLOWED_DURATIONS:
        raise HTTPException(status_code=400, detail=f"duration_hours must be one of {sorted(ALLOWED_DURATIONS)} or null (permanent).")

    # Block only if there is already a pending request (approved = allow extension)
    existing = await db.execute(
        select(DbAccessRequest).where(
            DbAccessRequest.user_id == user_id,
            DbAccessRequest.status == "pending",
            DbAccessRequest.scope_type == payload_in.scope_type,
            DbAccessRequest.database_id == payload_in.database_id if payload_in.scope_type == "database"
            else DbAccessRequest.table_id == payload_in.table_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="A pending request already exists for this resource.")

    req = DbAccessRequest(
        user_id=user_id,
        scope_type=payload_in.scope_type,
        database_id=payload_in.database_id,
        table_id=payload_in.table_id,
        justification=payload_in.justification,
        duration_hours=payload_in.duration_hours,
        status="pending",
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)

    db_name, tbl_name = await _resolve_names(req, db)
    return AccessRequestResponse(
        id=req.id, scope_type=req.scope_type, database_id=req.database_id,
        table_id=req.table_id, justification=req.justification,
        duration_hours=req.duration_hours, status=req.status,
        created_at=req.created_at, database_name=db_name, table_name=tbl_name,
    )


@router.get("/my-requests", response_model=list[AccessRequestResponse])
async def my_requests(
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_dm_db),
):
    payload = _parse_token(authorization)
    user_id = uuid.UUID(payload["sub"])

    result = await db.execute(
        select(DbAccessRequest)
        .where(DbAccessRequest.user_id == user_id)
        .order_by(DbAccessRequest.created_at.desc())
    )
    reqs = result.scalars().all()

    # Deduplicate: keep only the latest request per resource
    seen: set[tuple] = set()
    out = []
    for req in reqs:  # already ordered by created_at desc
        key = (req.scope_type, str(req.database_id), str(req.table_id))
        if key in seen:
            continue
        seen.add(key)
        db_name, tbl_name = await _resolve_names(req, db)
        expires_at = await _get_grant_expiry(req, db) if req.status == "approved" else None
        out.append(AccessRequestResponse(
            id=req.id, scope_type=req.scope_type, database_id=req.database_id,
            table_id=req.table_id, justification=req.justification,
            duration_hours=req.duration_hours, status=req.status,
            created_at=req.created_at, database_name=db_name, table_name=tbl_name,
            expires_at=expires_at,
        ))
    return out
