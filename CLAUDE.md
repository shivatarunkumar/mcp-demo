# CLAUDE.md — mcp-demo

## Project Overview

A full-stack **NL2SQL (Natural Language to SQL)** demo app built for a retail database.
Users type plain-English questions; the backend converts them to SQL via a local LLM (Ollama), executes the query against PostgreSQL, and returns results to the React Native / Expo web frontend.

---

## Repository Structure

```
mcp-demo/
├── backend/               # FastAPI + SQLAlchemy async API
│   ├── app/
│   │   ├── main.py        # App entry point, CORS, router registration
│   │   ├── config.py      # Pydantic settings (DATABASE_URL, Ollama URL, default model)
│   │   ├── database.py    # Async SQLAlchemy engine + get_db dependency
│   │   ├── models.py      # SQLAlchemy ORM models
│   │   ├── schemas.py     # Pydantic request/response schemas
│   │   ├── ollama_client.py  # Async Ollama HTTP client (generate + stream)
│   │   └── routers/
│   │       ├── query.py      # NL2SQL, raw SQL execution, schema introspection
│   │       ├── chat.py       # Streaming chat endpoint
│   │       ├── customers.py  # CRUD
│   │       ├── products.py   # CRUD
│   │       ├── orders.py     # CRUD
│   │       └── transactions.py # CRUD
│   ├── data-dictionary/   # JSON schema files used to build LLM system prompt
│   │   ├── customers.json
│   │   ├── orders.json
│   │   ├── products.json
│   │   ├── transactions.json
│   │   └── reviews.json
│   ├── .env               # Local env vars (not committed — see below)
│   └── pyproject.toml     # Poetry deps
├── frontend/              # React Native + Expo (web target)
│   ├── App.tsx            # Root navigator (Landing → Chat / TalkToData)
│   ├── src/
│   │   ├── screens/
│   │   │   ├── LandingScreen.tsx
│   │   │   ├── ChatScreen.tsx        # Free-form LLM chat
│   │   │   └── TalkToDataScreen.tsx  # NL2SQL interface with DB schema panel
│   │   ├── components/
│   │   │   ├── DBSchemaPanel.tsx     # Collapsible live schema viewer
│   │   │   ├── DataTable.tsx         # Query result table
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   └── TypingIndicator.tsx
│   │   ├── services/api.ts           # Fetch calls to backend
│   │   ├── hooks/useChat.ts
│   │   └── context/ThemeContext.tsx
│   ├── .env               # EXPO_PUBLIC_API_URL (not committed)
│   └── package.json
├── db-scripts/
│   ├── retailsdb.sql      # DDL — creates all tables
│   ├── load_mock_data.py  # Loads CSVs into PostgreSQL
│   ├── mock-data/         # CSV seed files (customers, products, orders, transactions, reviews)
│   └── README.md
└── demo.sh                # One-command start/stop for all services
```

---

## Tech Stack

| Layer        | Technology |
|--------------|-----------|
| Frontend     | React Native 0.81, Expo 54, TypeScript, React Navigation |
| Backend      | FastAPI, SQLAlchemy (async), asyncpg, Pydantic v2, Python 3.11+ |
| Database     | PostgreSQL (default port 5432, database `retaildb`) |
| LLM          | Ollama — default model `llama3.2` (local inference) |
| Package mgmt | Poetry (backend), npm (frontend) |

---

## Database Schema

Five tables in the `public` schema:

- **customers** — id, name, email, phone, city, created_at
- **products** — id, name, category, price, stock _(standalone, no FK to orders)_
- **orders** — id, customer_id → customers, order_date, status, total
- **transactions** — id, order_id → orders, amount, payment_method, transaction_date, status
- **reviews** — id, customer_id → customers, product_id → products, rating (1-5), comment, created_at

Valid joins: `customers → orders → transactions`. Products are a standalone catalog — do not join to orders/customers.

---

## Environment Variables

### `backend/.env`
```
DATABASE_URL=postgresql+asyncpg://<user>:<pass>@localhost:5432/retaildb
OLLAMA_BASE_URL=http://localhost:11434   # optional, default shown
DEFAULT_MODEL=llama3.2                  # optional, default shown
```

### `frontend/.env`
```
EXPO_PUBLIC_API_URL=http://localhost:8000
```

---

## Running the App

```bash
# Start everything (PostgreSQL must already exist; Ollama started automatically)
./demo.sh start

# Stop backend + frontend (Ollama and PostgreSQL left running)
./demo.sh stop

# Restart
./demo.sh restart
```

Services when running:
- Frontend → http://localhost:8081
- Backend  → http://localhost:8000
- Ollama   → http://localhost:11434

Logs: `.logs/backend.log`, `.logs/frontend.log`

---

## Development Commands

### Backend
```bash
cd backend
poetry install
poetry run uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npx expo start --web --port 8081
```

### Database Setup (first time)
```bash
psql -U postgres -f db-scripts/retailsdb.sql
python3 db-scripts/load_mock_data.py
```

---

## Key API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/query/nl2sql` | Natural language → SQL → execute → return results |
| POST | `/query/` | Execute raw SQL (SELECT only) |
| GET  | `/query/schema` | Live DB schema introspection |
| GET  | `/query/databases` | List accessible databases |
| GET  | `/chat/stream` | Streaming LLM chat (SSE) |
| CRUD | `/customers`, `/products`, `/orders`, `/transactions` | Standard REST |

---

## NL2SQL Architecture

1. `data-dictionary/*.json` files define table schema with column descriptions and constraints.
2. `_build_system_prompt()` in `routers/query.py` assembles the LLM system prompt from these files.
3. The prompt + user question is sent to Ollama (`/api/generate`, non-streaming).
4. The response is parsed by `_extract_sql()` to strip markdown/fences.
5. Only `SELECT`, `WITH`, or `EXPLAIN` queries are permitted to execute.
6. Results are returned as `{columns, rows, row_count}`.

To improve query accuracy, edit the JSON files in `backend/data-dictionary/` — they directly feed the LLM prompt.

---

## Important Notes

- The backend enforces **read-only** SQL (SELECT/WITH/EXPLAIN only — no writes).
- `demo.sh` writes PIDs to `.pids/` and logs to `.logs/` (both gitignored).
- `backend/.env` and `frontend/.env` are not committed — never add secrets to the repo.
- Ollama must be running before `demo.sh start` if it isn't already (`ollama serve &`).
