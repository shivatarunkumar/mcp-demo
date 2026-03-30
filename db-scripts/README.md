# DB Scripts

Database setup, schema, and mock data scripts for the `retaildb` PostgreSQL database.

## Prerequisites

- PostgreSQL 15+
- Python 3.x
- `psycopg2-binary` Python package

```bash
pip3 install psycopg2-binary
```

---

## Setup Order

Run the scripts in the following order:

### 1. `create_user.sql`
Creates the `retaildb` database and the `tarun` user with full privileges.

Run as superuser (e.g. `postgres`):
```bash
psql -U postgres -f create_user.sql
```

> **PostgreSQL 15+ note:** After creating the database, reconnect to `retaildb` and run the `GRANT` lines at the bottom of the file.

---

### 2. `grant_retaildb.sql`
Grants schema-level permissions to `tarun` on the `retaildb` database.
Must be run as superuser **connected to `retaildb`**:

```bash
psql -U postgres -d retaildb -f grant_retaildb.sql
```

---

### 3. `retailsdb.sql`
Creates all 4 tables in the `retaildb` database.

```bash
psql -U tarun -d retaildb -f retailsdb.sql
```

#### Tables

| Table | Description |
|-------|-------------|
| `customers` | Customer records (id, name, email, phone, city) |
| `products` | Product catalog (id, name, category, price, stock) |
| `orders` | Customer orders linked to customers via `customer_id` |
| `transactions` | Payment transactions linked to orders via `order_id` |

#### Relationships

```
customers
    └── orders (customer_id → customers.id)
            └── transactions (order_id → orders.id)
```

---

### 4. Load Mock Data

#### Option A — Python (recommended)

```bash
python3 load_mock_data.py
```

Loads all 4 CSV files in FK-safe order. Safe to re-run (uses `ON CONFLICT DO NOTHING`).

#### Option B — psql

Run from inside the `db-scripts/` directory:
```bash
psql -U tarun -d retaildb -f load_mock_data.sql
```

---

## Mock Data

Located in `mock-data/`:

| File | Table | Rows |
|------|-------|------|
| `customers.csv` | `customers` | 10 |
| `products.csv` | `products` | 12 |
| `orders.csv` | `orders` | 12 |
| `transactions.csv` | `transactions` | 12 |

Data integrity is maintained across all files:
- Every `order.customer_id` references a valid customer
- Every `transaction.order_id` references a valid order
- Cancelled orders have a corresponding failed transaction

---

## Database Credentials

| Field | Value |
|-------|-------|
| Host | localhost |
| Port | 5432 |
| Database | retaildb |
| User | tarun |
| Password | 12345 |
