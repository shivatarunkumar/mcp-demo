from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


# ── Customers ──────────────────────────────────────────────────────────────────

class CustomerBase(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    city: str | None = None


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(CustomerBase):
    pass


class CustomerOut(CustomerBase):
    id: int
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


# ── Products ───────────────────────────────────────────────────────────────────

class ProductBase(BaseModel):
    name: str | None = None
    category: str | None = None
    price: Decimal | None = None
    stock: int | None = None


class ProductCreate(ProductBase):
    pass


class ProductUpdate(ProductBase):
    pass


class ProductOut(ProductBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# ── Orders ─────────────────────────────────────────────────────────────────────

class OrderBase(BaseModel):
    customer_id: int | None = None
    status: str | None = None
    total: Decimal | None = None


class OrderCreate(OrderBase):
    pass


class OrderUpdate(OrderBase):
    pass


class OrderOut(OrderBase):
    id: int
    order_date: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


# ── Transactions ───────────────────────────────────────────────────────────────

class TransactionBase(BaseModel):
    order_id: int | None = None
    amount: Decimal | None = None
    payment_method: str | None = None
    status: str | None = None


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(TransactionBase):
    pass


class TransactionOut(TransactionBase):
    id: int
    transaction_date: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


# ── Chat / LLM ─────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    prompt: str
    model: str | None = None
    stream: bool = False


class ChatResponse(BaseModel):
    model: str
    response: str
    done: bool = True
    prompt_eval_count: int | None = None
    eval_count: int | None = None


# ── Raw query ──────────────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    sql: str
    db_name: str | None = None


class QueryResponse(BaseModel):
    columns: list[str]
    rows: list[dict]
    row_count: int


# ── NL2SQL ─────────────────────────────────────────────────────────────────────

class NL2SQLRequest(BaseModel):
    question: str
    model: str | None = None
    db_name: str | None = None


class NL2SQLResponse(BaseModel):
    question: str
    sql: str
    columns: list[str] = []
    rows: list[dict] = []
    row_count: int = 0
    error: str | None = None


# ── DB Schema introspection ────────────────────────────────────────────────────

class ColumnInfo(BaseModel):
    name: str
    type: str
    nullable: bool
    is_primary_key: bool
    is_foreign_key: bool
    foreign_table: str | None = None


class TableInfo(BaseModel):
    name: str
    row_count: int
    columns: list[ColumnInfo]


class SchemaResponse(BaseModel):
    database: str
    tables: list[TableInfo]
