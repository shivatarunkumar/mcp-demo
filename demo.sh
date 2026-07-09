#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# demo.sh  –  start | stop  all services for the mcp-demo app
#
# Usage:
#   ./demo.sh start   – check requirements, install deps, launch all services
#   ./demo.sh stop    – gracefully stop all services
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$REPO_DIR/backend"
FRONTEND_DIR="$REPO_DIR/frontend"

LOG_DIR="$REPO_DIR/.logs"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
PID_DIR="$REPO_DIR/.pids"
BACKEND_PID="$PID_DIR/backend.pid"
FRONTEND_PID="$PID_DIR/frontend.pid"

OLLAMA_MODEL="llama3.2"
BACKEND_PORT=8000
FRONTEND_PORT=8081   # expo web default

# Populated by check_requirements from DATABASE_URL
pg_host="localhost"; pg_port=5432; pg_user=""; pg_db=""

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
die()     { error "$*"; exit 1; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }

# ── Helpers ───────────────────────────────────────────────────────────────────

require_cmd() {
  local cmd=$1 hint=${2:-""}
  if ! command -v "$cmd" &>/dev/null; then
    error "Required command not found: $cmd"
    [[ -n "$hint" ]] && error "  Install hint: $hint"
    return 1
  fi
  success "$cmd found ($(command -v "$cmd"))"
}

port_in_use() { lsof -iTCP:"$1" -sTCP:LISTEN -t &>/dev/null; }

pid_alive() {
  local pid=$1
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

read_pid() { [[ -f "$1" ]] && cat "$1" || echo ""; }

kill_pid() {
  local pid=$1 name=$2
  info "Stopping $name (PID $pid)..."
  kill "$pid" 2>/dev/null || true
  local i=0
  while pid_alive "$pid" && (( i < 15 )); do sleep 1; (( i++ )); done
  pid_alive "$pid" && kill -9 "$pid" 2>/dev/null || true
  success "$name stopped."
}

stop_service() {
  local name=$1 pidfile=$2 port=${3:-""}
  local pid; pid=$(read_pid "$pidfile")

  if pid_alive "$pid"; then
    kill_pid "$pid" "$name"
    rm -f "$pidfile"
    return
  fi

  # PID file stale or missing — fall back to finding process by port
  if [[ -n "$port" ]]; then
    local port_pids
    port_pids=$(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
    if [[ -n "$port_pids" ]]; then
      for p in $port_pids; do
        kill_pid "$p" "$name (port $port)"
      done
      rm -f "$pidfile"
      return
    fi
  fi

  warn "$name is not running."
  rm -f "$pidfile"
}

# ─────────────────────────────────────────────────────────────────────────────
# CHECK REQUIREMENTS
# ─────────────────────────────────────────────────────────────────────────────
check_requirements() {
  header "==> Checking system requirements"
  local ok=true

  require_cmd python3   "https://www.python.org/downloads/" || ok=false
  require_cmd node      "https://nodejs.org/"               || ok=false
  require_cmd npm       "Comes with Node.js"                || ok=false
  require_cmd ollama    "https://ollama.com/download"        || ok=false
  require_cmd psql      "Install PostgreSQL client tools"   || ok=false

  # Python version ≥ 3.11
  local pyver; pyver=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
  if python3 -c "import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)"; then
    success "Python $pyver (≥ 3.11)"
  else
    error "Python $pyver found but 3.11+ is required."; ok=false
  fi

  # Node version ≥ 18
  local nodever; nodever=$(node -e "process.stdout.write(process.version)")
  local nodemaj; nodemaj=$(echo "$nodever" | tr -d 'v' | cut -d. -f1)
  if (( nodemaj >= 18 )); then
    success "Node $nodever (≥ 18)"
  else
    error "Node $nodever found but 18+ is required."; ok=false
  fi

  # Poetry
  if ! command -v poetry &>/dev/null; then
    warn "poetry not found — installing via pip…"
    pip3 install --quiet poetry || { error "Failed to install poetry."; ok=false; }
  else
    success "poetry found"
  fi

  # PostgreSQL reachable — parse asyncpg URL via env var to avoid shell escape issues
  if [[ -n "${DATABASE_URL:-}" ]]; then
    pg_host=$(DB_URL="$DATABASE_URL" python3 -c "import os,re; u=re.sub(r'^postgresql\+asyncpg','postgresql',os.environ['DB_URL']); from urllib.parse import urlparse; p=urlparse(u); print(p.hostname or 'localhost')")
    pg_port=$(DB_URL="$DATABASE_URL" python3 -c "import os,re; u=re.sub(r'^postgresql\+asyncpg','postgresql',os.environ['DB_URL']); from urllib.parse import urlparse; p=urlparse(u); print(p.port or 5432)")
    pg_user=$(DB_URL="$DATABASE_URL" python3 -c "import os,re; u=re.sub(r'^postgresql\+asyncpg','postgresql',os.environ['DB_URL']); from urllib.parse import urlparse; p=urlparse(u); print(p.username or '')")
    pg_db=$(DB_URL="$DATABASE_URL"   python3 -c "import os,re; u=re.sub(r'^postgresql\+asyncpg','postgresql',os.environ['DB_URL']); from urllib.parse import urlparse; p=urlparse(u); print(p.path.lstrip('/') or '')")
    if psql -h "$pg_host" -p "$pg_port" -U "$pg_user" -d "$pg_db" -c '\q' &>/dev/null 2>&1; then
      success "PostgreSQL reachable ($pg_user@$pg_host:$pg_port/$pg_db)"
    else
      warn "PostgreSQL not reachable — will attempt to start it."
    fi
  else
    warn "DATABASE_URL not set — skipping PostgreSQL check."
  fi

  $ok || die "One or more requirements are missing. Fix the errors above and re-run."
  success "All requirements satisfied."
}

# ─────────────────────────────────────────────────────────────────────────────
# INSTALL DEPENDENCIES
# ─────────────────────────────────────────────────────────────────────────────
install_deps() {
  header "==> Installing dependencies"

  # Backend (Poetry)
  info "Backend: poetry install… (this may take a minute on first run)"
  (cd "$BACKEND_DIR" && poetry install --no-interaction --no-root)
  success "Backend dependencies ready."

  # Frontend (npm)
  info "Frontend: npm install… (this may take a minute on first run)"
  (cd "$FRONTEND_DIR" && npm install)
  success "Frontend dependencies ready."

  # Ollama model
  info "Checking Ollama model '$OLLAMA_MODEL'…"
  if ollama list 2>/dev/null | grep -q "^${OLLAMA_MODEL}"; then
    success "Ollama model '$OLLAMA_MODEL' already pulled."
  else
    info "Pulling Ollama model '$OLLAMA_MODEL' (this may take a while)…"
    ollama pull "$OLLAMA_MODEL" || die "Failed to pull Ollama model '$OLLAMA_MODEL'."
    success "Ollama model '$OLLAMA_MODEL' ready."
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# START
# ─────────────────────────────────────────────────────────────────────────────
cmd_start() {
  mkdir -p "$LOG_DIR" "$PID_DIR"

  # Load backend .env so DATABASE_URL is available for the requirement check
  if [[ -f "$BACKEND_DIR/.env" ]]; then
    set -o allexport
    # shellcheck disable=SC1091
    source "$BACKEND_DIR/.env"
    set +o allexport
  else
    warn "backend/.env not found — copy backend/.env.example and fill in values."
  fi

  check_requirements
  install_deps

  header "==> Starting services"

  # ── PostgreSQL ───────────────────────────────────────────────────────────────
  if psql -h "$pg_host" -p "$pg_port" -U "$pg_user" -d "$pg_db" -c '\q' &>/dev/null 2>&1; then
    success "PostgreSQL is already running — skipping."
  else
    info "Starting PostgreSQL…"
    if command -v brew &>/dev/null && brew list --formula 2>/dev/null | grep -q "postgresql"; then
      local pg_formula; pg_formula=$(brew list --formula | grep "postgresql" | sort -V | tail -1)
      brew services start "$pg_formula" &>/dev/null
    elif command -v pg_ctl &>/dev/null; then
      pg_ctl start -D "$(pg_ctl status 2>/dev/null | awk '{print $NF}' | tr -d "'")" &>/dev/null || true
    else
      die "Cannot start PostgreSQL automatically. Please start it manually and re-run."
    fi
    local i=0
    until psql -h "$pg_host" -p "$pg_port" -U "$pg_user" -d "$pg_db" -c '\q' &>/dev/null 2>&1 || (( i >= 15 )); do
      sleep 1; (( i++ ))
    done
    psql -h "$pg_host" -p "$pg_port" -U "$pg_user" -d "$pg_db" -c '\q' &>/dev/null 2>&1 \
      && success "PostgreSQL started." \
      || die "PostgreSQL failed to start. Check that the database '$pg_db' exists."
  fi

  # ── Ollama ──────────────────────────────────────────────────────────────────
  if curl -s http://localhost:11434/api/tags &>/dev/null; then
    success "Ollama is already running — skipping."
  else
    info "Starting Ollama…"
    ollama serve &>/dev/null &
    disown
    local i=0
    until curl -s http://localhost:11434/api/tags &>/dev/null || (( i >= 15 )); do
      sleep 1; (( i++ ))
    done
    curl -s http://localhost:11434/api/tags &>/dev/null \
      && success "Ollama started." \
      || die "Ollama failed to start. Check 'ollama serve' manually."
  fi

  # ── Backend ─────────────────────────────────────────────────────────────────
  local existing_backend; existing_backend=$(read_pid "$BACKEND_PID")
  if pid_alive "$existing_backend"; then
    success "Backend is already running (PID $existing_backend) — skipping."
  elif port_in_use "$BACKEND_PORT"; then
    warn "Port $BACKEND_PORT is in use by another process — skipping backend start."
  else
    info "Starting backend on port ${BACKEND_PORT}..."
    (
      cd "$BACKEND_DIR"
      poetry run uvicorn app.main:app --host 0.0.0.0 --port "$BACKEND_PORT" \
        >> "$BACKEND_LOG" 2>&1
    ) &
    echo $! > "$BACKEND_PID"
    sleep 2
    pid_alive "$(read_pid "$BACKEND_PID")" \
      && success "Backend started (PID $(read_pid "$BACKEND_PID")). Logs: $BACKEND_LOG" \
      || die "Backend failed to start. Check $BACKEND_LOG for details."
  fi

  # ── Frontend ────────────────────────────────────────────────────────────────
  local existing_frontend; existing_frontend=$(read_pid "$FRONTEND_PID")
  if pid_alive "$existing_frontend"; then
    success "Frontend is already running (PID $existing_frontend) — skipping."
  elif port_in_use "$FRONTEND_PORT"; then
    warn "Port $FRONTEND_PORT is in use by another process — skipping frontend start."
  else
    info "Starting frontend (Expo web)…"
    (
      cd "$FRONTEND_DIR"
      BROWSER=none npx expo start --web --port "$FRONTEND_PORT" \
        >> "$FRONTEND_LOG" 2>&1
    ) &
    echo $! > "$FRONTEND_PID"
    sleep 4
    pid_alive "$(read_pid "$FRONTEND_PID")" \
      && success "Frontend started (PID $(read_pid "$FRONTEND_PID")). Logs: $FRONTEND_LOG" \
      || die "Frontend failed to start. Check $FRONTEND_LOG for details."
  fi

  echo ""
  echo -e "${BOLD}${GREEN}All services are up!${RESET}"
  echo -e "  Frontend  →  ${CYAN}http://localhost:${FRONTEND_PORT}${RESET}"
  echo -e "  Backend   →  ${CYAN}http://localhost:${BACKEND_PORT}${RESET}"
  echo -e "  Ollama    →  ${CYAN}http://localhost:11434${RESET}"
  echo -e "\nRun ${BOLD}./demo.sh stop${RESET} to shut everything down."
}

# ─────────────────────────────────────────────────────────────────────────────
# STOP
# ─────────────────────────────────────────────────────────────────────────────
cmd_stop() {
  header "==> Stopping services"
  stop_service "Frontend" "$FRONTEND_PID" "$FRONTEND_PORT"
  stop_service "Backend"  "$BACKEND_PID"  "$BACKEND_PORT"

  # Ollama — leave it alone (system service)
  if curl -s http://localhost:11434/api/tags &>/dev/null; then
    warn "Ollama is running — leaving it alone. To stop: pkill ollama"
  fi

  # PostgreSQL — leave it alone (system service)
  warn "PostgreSQL left running. To stop: brew services stop postgresql@16"

  success "Done."
}

# ─────────────────────────────────────────────────────────────────────────────
# RESTART
# ─────────────────────────────────────────────────────────────────────────────
cmd_restart() {
  header "==> Restarting services"
  cmd_stop
  echo ""
  cmd_start
}

# ─────────────────────────────────────────────────────────────────────────────
# ENTRYPOINT
# ─────────────────────────────────────────────────────────────────────────────
case "${1:-}" in
  start)   cmd_start   ;;
  stop)    cmd_stop    ;;
  restart) cmd_restart ;;
  *)
    echo -e "Usage: ${BOLD}./demo.sh${RESET} <start|stop|restart>"
    echo ""
    echo "  start    –  verify requirements, install missing deps, launch all services"
    echo "  stop     –  gracefully stop frontend and backend (Ollama left to user)"
    echo "  restart  –  stop all services then start them again"
    exit 1
    ;;
esac
