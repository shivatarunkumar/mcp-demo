import json
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app import ollama_client
from app.config import settings
from app.database import get_db
from app.schemas import NL2SQLRequest, NL2SQLResponse, QueryRequest, QueryResponse, ColumnInfo, SchemaResponse, TableInfo

router = APIRouter(prefix="/query", tags=["query"])

_ALLOWED_PREFIXES = ("select", "with", "explain")

_DATA_DICT_DIR = Path(__file__).resolve().parents[2] / "data-dictionary"


def _load_schema_from_data_dictionary() -> str:
    lines = ["Tables in the PostgreSQL database:\n"]
    for path in sorted(_DATA_DICT_DIR.glob("*.json")):
        table = json.loads(path.read_text())
        cols = ", ".join(
            f"{c['name']} {c['type']}"
            + (f" ({', '.join(c['constraints'])})" if c.get("constraints") else "")
            + (f" -- {c['description']}" if c.get("description") else "")
            for c in table["columns"]
        )
        lines.append(f"{table['table']}  ({cols})")
    return "\n".join(lines)


def _build_system_prompt() -> str:
    schema = _load_schema_from_data_dictionary()
    return (
        "You are a PostgreSQL expert. Given a natural language question and the database schema below, "
        "return ONLY the SQL query — no explanation, no markdown, no backticks. "
        "The query must be a single SELECT statement.\n\n"
        "STRICT RULES:\n"
        "- Use ONLY the exact table names and column names listed in the schema below. Never invent or guess names.\n"
        "- When joining tables, always qualify every column reference with its correct table alias.\n"
        "- Use <> for not-equal comparisons (not !=).\n"
        "- For status filters use the exact values likely stored (e.g. 'failed', 'pending', 'completed').\n\n"
        + schema
    )


def _extract_sql(raw: str) -> str:
    """Pull the first SQL statement out of an LLM response."""
    fenced = re.search(r"```(?:sql)?\s*([\s\S]+?)```", raw, re.IGNORECASE)
    if fenced:
        return fenced.group(1).strip()
    match = re.search(r"(select[\s\S]+?;)", raw, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return raw.strip()


async def _execute_sql(sql: str, db: AsyncSession) -> QueryResponse:
    stripped = sql.strip().lower()
    if not any(stripped.startswith(p) for p in _ALLOWED_PREFIXES):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only SELECT / WITH / EXPLAIN queries are allowed.",
        )
    try:
        result = await db.execute(text(sql))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    columns = list(result.keys())
    rows = [dict(zip(columns, row)) for row in result.fetchall()]
    return QueryResponse(columns=columns, rows=rows, row_count=len(rows))


async def _fetch_schema(db: AsyncSession) -> SchemaResponse:
    db_row = await db.execute(text("SELECT current_database()"))
    database = db_row.scalar()

    tables_result = await db.execute(text("""
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
    """))
    table_names = [r[0] for r in tables_result.fetchall()]

    pk_result = await db.execute(text("""
        SELECT kcu.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
    """))
    pks: set[tuple[str, str]] = {(r[0], r[1]) for r in pk_result.fetchall()}

    fk_result = await db.execute(text("""
        SELECT kcu.table_name, kcu.column_name, ccu.table_name AS foreign_table
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    """))
    fks: dict[tuple[str, str], str] = {(r[0], r[1]): r[2] for r in fk_result.fetchall()}

    tables: list[TableInfo] = []
    for tname in table_names:
        col_result = await db.execute(text("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = :t
            ORDER BY ordinal_position
        """), {"t": tname})

        columns = [
            ColumnInfo(
                name=r[0],
                type=r[1],
                nullable=r[2] == "YES",
                is_primary_key=(tname, r[0]) in pks,
                is_foreign_key=(tname, r[0]) in fks,
                foreign_table=fks.get((tname, r[0])),
            )
            for r in col_result.fetchall()
        ]

        count_result = await db.execute(text(f'SELECT COUNT(*) FROM "{tname}"'))
        row_count = count_result.scalar() or 0

        tables.append(TableInfo(name=tname, row_count=row_count, columns=columns))

    return SchemaResponse(database=database, tables=tables)


@router.post("/", response_model=QueryResponse)
async def run_query(payload: QueryRequest, db: AsyncSession = Depends(get_db)):
    return await _execute_sql(payload.sql, db)


@router.get("/databases", response_model=list[str])
async def list_databases(db: AsyncSession = Depends(get_db)):
    """List all accessible PostgreSQL databases."""
    result = await db.execute(text("""
        SELECT datname FROM pg_database
        WHERE datistemplate = false AND datallowconn = true
        ORDER BY datname
    """))
    return [r[0] for r in result.fetchall()]


@router.get("/schema", response_model=SchemaResponse)
async def get_schema(
    db_name: str | None = Query(default=None, description="Target database name"),
    db: AsyncSession = Depends(get_db),
):
    if db_name:
        # Build a temporary connection to the requested database
        base_url = settings.database_url.rsplit("/", 1)[0]
        target_url = f"{base_url}/{db_name}"
        tmp_engine = create_async_engine(target_url)
        try:
            tmp_maker = async_sessionmaker(tmp_engine, expire_on_commit=False)
            async with tmp_maker() as tmp_db:
                return await _fetch_schema(tmp_db)
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
        finally:
            await tmp_engine.dispose()
    return await _fetch_schema(db)


@router.post("/nl2sql", response_model=NL2SQLResponse)
async def nl2sql(payload: NL2SQLRequest, db: AsyncSession = Depends(get_db)):
    model = payload.model or settings.default_model
    prompt = f"{_build_system_prompt()}\nQuestion: {payload.question}\nSQL:"

    try:
        result = await ollama_client.generate(prompt, model)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Ollama error: {exc}")

    sql = _extract_sql(result.get("response", ""))
    if not sql:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="LLM did not return a valid SQL query.")

    try:
        query_result = await _execute_sql(sql, db)
        return NL2SQLResponse(
            question=payload.question,
            sql=sql,
            columns=query_result.columns,
            rows=query_result.rows,
            row_count=query_result.row_count,
        )
    except HTTPException as exc:
        return NL2SQLResponse(question=payload.question, sql=sql, error=exc.detail)
