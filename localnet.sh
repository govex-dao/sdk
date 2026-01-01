#!/bin/bash
#
# Govex Local Development Master Script
#
# Usage:
#   ./localnet.sh              # Start everything (localnet, db, indexer)
#   ./localnet.sh --deploy     # Also deploy packages
#   ./localnet.sh --e2e        # Also run E2E tests after deploy
#   ./localnet.sh --stop       # Stop all processes
#   ./localnet.sh --clean      # Stop and clean all data
#   ./localnet.sh --restart    # Clean restart (stop, clean, start)
#
set -e

# === Configuration ===
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PACKAGES_DIR="$PROJECT_ROOT/packages"
SDK_DIR="$PROJECT_ROOT/sdk"
BACKEND_DIR="$PROJECT_ROOT/app/backend"
DB_PATH="/tmp/govex-dev-v2.db"
PID_DIR="/tmp/govex-pids"
LOG_DIR="/tmp/govex-logs"

# Sui localnet ports
SUI_RPC_PORT=9000
SUI_FAUCET_PORT=9123
SUI_GRAPHQL_PORT=9125
INDEXER_METRICS_PORT=9090
API_SERVER_PORT=3000

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Track if we're in the main process (for cleanup)
MAIN_PID=$$
CLEANUP_DONE=false

# === Helper Functions ===

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

log_section() {
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════${NC}"
  echo -e "${CYAN} $1${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════${NC}"
}

ensure_dirs() {
  mkdir -p "$PID_DIR"
  mkdir -p "$LOG_DIR"
}

save_pid() {
  local name=$1
  local pid=$2
  echo "$pid" > "$PID_DIR/$name.pid"
  log_info "Saved PID $pid for $name"
}

get_pid() {
  local name=$1
  local pid_file="$PID_DIR/$name.pid"
  if [[ -f "$pid_file" ]]; then
    cat "$pid_file"
  fi
}

remove_pid() {
  local name=$1
  rm -f "$PID_DIR/$name.pid"
}

is_running() {
  local pid=$1
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    return 0
  fi
  return 1
}

is_port_in_use() {
  local port=$1
  if lsof -i ":$port" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

kill_port() {
  local port=$1
  local pids=$(lsof -ti ":$port" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    log_info "Killing processes on port $port: $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
}

wait_for_port() {
  local port=$1
  local name=$2
  local max_attempts=${3:-60}
  local attempt=0

  log_info "Waiting for $name on port $port..."

  while ! nc -z localhost "$port" 2>/dev/null; do
    attempt=$((attempt + 1))
    if [[ $attempt -ge $max_attempts ]]; then
      log_error "$name failed to start on port $port after $max_attempts seconds"
      return 1
    fi
    printf "."
    sleep 1
  done
  echo ""

  log_success "$name is ready on port $port"
  return 0
}

wait_for_sui_rpc() {
  local max_attempts=${1:-120}
  local attempt=0

  log_info "Waiting for Sui RPC to respond..."

  while true; do
    attempt=$((attempt + 1))
    if [[ $attempt -ge $max_attempts ]]; then
      log_error "Sui RPC failed to respond after $max_attempts seconds"
      return 1
    fi

    # Try to get the latest checkpoint
    local response=$(curl -s -X POST "http://127.0.0.1:$SUI_RPC_PORT" \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","id":1,"method":"sui_getLatestCheckpointSequenceNumber","params":[]}' \
      2>/dev/null || true)

    if echo "$response" | grep -q '"result"'; then
      log_success "Sui RPC is responding"
      return 0
    fi

    printf "."
    sleep 1
  done
}

# === Cleanup & Signal Handling ===

cleanup() {
  if [[ "$CLEANUP_DONE" == "true" ]]; then
    return
  fi
  CLEANUP_DONE=true

  echo ""
  log_section "Cleaning Up"

  # Stop child processes
  stop_process "api-server" "quiet"
  stop_process "indexer" "quiet"
  stop_process "sui-localnet" "quiet"

  # Kill any remaining processes on our ports
  kill_port $SUI_RPC_PORT
  kill_port $SUI_FAUCET_PORT
  kill_port $SUI_GRAPHQL_PORT
  kill_port $INDEXER_METRICS_PORT
  kill_port $API_SERVER_PORT

  log_success "Cleanup complete"
}

# Trap signals for cleanup
trap cleanup EXIT
trap 'echo ""; log_warn "Interrupted"; exit 130' INT
trap 'echo ""; log_warn "Terminated"; exit 143' TERM

# === Process Management ===

stop_process() {
  local name=$1
  local quiet=$2
  local pid=$(get_pid "$name")

  if [[ -z "$pid" ]]; then
    # Check for stale processes by name
    case $name in
      "sui-localnet")
        pid=$(pgrep -f "sui start" 2>/dev/null | head -1 || true)
        ;;
      "indexer")
        pid=$(pgrep -f "grpc-indexer" 2>/dev/null | head -1 || true)
        ;;
      "api-server")
        pid=$(pgrep -f "api-server" 2>/dev/null | head -1 || true)
        ;;
    esac
  fi

  if [[ -n "$pid" ]] && is_running "$pid"; then
    [[ -z "$quiet" ]] && log_info "Stopping $name (PID: $pid)..."

    # Send SIGTERM first
    kill "$pid" 2>/dev/null || true

    # Wait for graceful shutdown (up to 10 seconds)
    local attempts=0
    while is_running "$pid" && [[ $attempts -lt 10 ]]; do
      sleep 1
      attempts=$((attempts + 1))
    done

    # Force kill if still running
    if is_running "$pid"; then
      [[ -z "$quiet" ]] && log_warn "Force killing $name..."
      kill -9 "$pid" 2>/dev/null || true
      sleep 1
    fi

    [[ -z "$quiet" ]] && log_success "$name stopped"
  else
    [[ -z "$quiet" ]] && log_info "$name is not running"
  fi

  remove_pid "$name"
}

# ============================================================================
# POSTGRES SETUP FOR SUI INDEXER
# ============================================================================

setup_sui_postgres() {
  log_info "Setting up Postgres for Sui indexer..."

  # Check if postgres is running
  if ! pg_isready -q 2>/dev/null; then
    log_warn "Postgres is not running. Trying to start it..."
    brew services start postgresql@15 2>/dev/null || brew services start postgresql 2>/dev/null || true
    sleep 2
    if ! pg_isready -q 2>/dev/null; then
      log_error "Could not start Postgres. Sui indexer will not work."
      return 1
    fi
  fi

  # Create postgres role if it doesn't exist
  if ! psql postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='postgres'" 2>/dev/null | grep -q 1; then
    log_info "Creating 'postgres' role..."
    psql postgres -c "CREATE ROLE postgres WITH LOGIN PASSWORD 'postgrespw' SUPERUSER;" 2>/dev/null || true
  fi

  # Create sui_indexer database if it doesn't exist
  if ! psql postgres -tAc "SELECT 1 FROM pg_database WHERE datname='sui_indexer'" 2>/dev/null | grep -q 1; then
    log_info "Creating 'sui_indexer' database..."
    psql postgres -c "CREATE DATABASE sui_indexer OWNER postgres;" 2>/dev/null || true
  fi

  # Drop and recreate for clean state (localnet always does --force-regenesis)
  log_info "Resetting sui_indexer database for clean state..."
  psql postgres -c "DROP DATABASE IF EXISTS sui_indexer;" 2>/dev/null || true
  psql postgres -c "CREATE DATABASE sui_indexer OWNER postgres;" 2>/dev/null || true

  log_success "Postgres ready for Sui indexer"
}

stop_all() {
  log_section "Stopping All Processes"

  stop_process "api-server"
  stop_process "indexer"
  stop_process "sui-localnet"

  # Kill any orphaned processes
  log_info "Killing any orphaned Sui processes..."
  pkill -9 -f "sui start" 2>/dev/null || true
  pkill -9 -f "sui-node" 2>/dev/null || true
  pkill -9 -f "grpc-indexer" 2>/dev/null || true
  pkill -9 -f "api-server" 2>/dev/null || true

  # Clear ports
  kill_port $SUI_RPC_PORT
  kill_port $SUI_FAUCET_PORT
  kill_port $SUI_GRAPHQL_PORT
  kill_port $INDEXER_METRICS_PORT
  kill_port $API_SERVER_PORT

  # Give processes time to die
  sleep 2

  log_success "All processes stopped"
}

clean_data() {
  log_section "Cleaning Data"

  # Remove database
  if [[ -f "$DB_PATH" ]]; then
    rm -f "$DB_PATH"
    log_success "Removed database: $DB_PATH"
  fi

  # Remove Sui localnet data (force regenesis will do this anyway)
  local sui_db_dir="$HOME/.sui/sui_config/network"
  if [[ -d "$sui_db_dir" ]]; then
    log_info "Sui data will be reset on next start (--force-regenesis)"
  fi

  # Remove logs
  rm -f "$LOG_DIR"/*.log 2>/dev/null || true

  # Remove PID files
  rm -f "$PID_DIR"/*.pid 2>/dev/null || true

  log_success "Data cleaned"
}

hard_reset() {
  log_section "HARD RESET - Nuking Everything"

  # Stop all processes
  stop_all

  # Remove database
  rm -f "$DB_PATH" 2>/dev/null || true
  log_success "Removed database"

  # Remove ALL Sui config and data
  if [[ -d "$HOME/.sui" ]]; then
    rm -rf "$HOME/.sui"
    log_success "Removed ~/.sui (all Sui config and data)"
  fi

  # Remove logs
  rm -rf "$LOG_DIR" 2>/dev/null || true
  log_success "Removed logs"

  # Remove PID files
  rm -rf "$PID_DIR" 2>/dev/null || true
  log_success "Removed PID files"

  # Remove deployment artifacts
  rm -f "$PACKAGES_DIR/deployments-processed/_all-packages-localnet.json" 2>/dev/null || true
  rm -f "$PACKAGES_DIR/deployments/"*-localnet.json 2>/dev/null || true
  log_success "Removed deployment artifacts"

  # Remove SDK test data files (stale object IDs from previous runs)
  rm -f "$SDK_DIR/test-dao-info.json" 2>/dev/null || true
  rm -f "$SDK_DIR/conditional-coins-info.json" 2>/dev/null || true
  rm -f "$SDK_DIR/test-coins-info.json" 2>/dev/null || true
  log_success "Removed SDK test data files"

  # Remove backend .env
  rm -f "$BACKEND_DIR/.env" 2>/dev/null || true
  log_success "Removed backend .env"

  # Kill any remaining sui/node processes
  pkill -9 -f "sui" 2>/dev/null || true
  pkill -9 -f "grpc-indexer" 2>/dev/null || true

  log_success "HARD RESET COMPLETE - Everything nuked"
}

# === Sui Localnet ===

start_sui_localnet() {
  log_section "Starting Sui Localnet"

  # Check if already running
  local pid=$(get_pid "sui-localnet")
  if is_running "$pid"; then
    log_warn "Sui localnet already running (PID: $pid)"
    # Verify it's actually responding
    if wait_for_sui_rpc 5; then
      return 0
    else
      log_warn "Sui not responding, restarting..."
      stop_process "sui-localnet"
    fi
  fi

  # Make sure ports are free
  if is_port_in_use $SUI_RPC_PORT; then
    log_warn "Port $SUI_RPC_PORT in use, killing..."
    kill_port $SUI_RPC_PORT
    sleep 2
  fi

  ensure_dirs

  # Setup Postgres for Sui indexer (creates role and database if needed)
  setup_sui_postgres

  log_info "Starting Sui localnet..."
  log_info "  RPC:     http://127.0.0.1:$SUI_RPC_PORT"
  log_info "  Faucet:  http://127.0.0.1:$SUI_FAUCET_PORT"
  log_info "  GraphQL: http://127.0.0.1:$SUI_GRAPHQL_PORT"

  # Start sui in background with nohup to survive script exit
  nohup sui start --force-regenesis --with-faucet --with-indexer --with-graphql \
    > "$LOG_DIR/sui-localnet.log" 2>&1 &

  local sui_pid=$!
  save_pid "sui-localnet" "$sui_pid"

  log_info "Sui localnet starting (PID: $sui_pid)"
  log_info "Log: $LOG_DIR/sui-localnet.log"

  # Wait for RPC to be ready
  if ! wait_for_sui_rpc 120; then
    log_error "Sui localnet failed to start"
    log_error "Last 50 lines of log:"
    tail -50 "$LOG_DIR/sui-localnet.log" || true
    return 1
  fi

  # Configure client for localnet (non-interactive)
  log_info "Configuring Sui client..."

  # Create client config directory
  mkdir -p "$HOME/.sui/sui_config"

  # Generate new address and config if needed
  if [[ ! -f "$HOME/.sui/sui_config/client.yaml" ]]; then
    log_info "Generating new Sui client config..."

    # Create empty keystore first
    echo "[]" > "$HOME/.sui/sui_config/sui.keystore"

    # Create minimal client config pointing to localnet with null address
    # (will be populated when we create a new address)
    cat > "$HOME/.sui/sui_config/client.yaml" << YAML
---
keystore:
  File: ${HOME}/.sui/sui_config/sui.keystore
envs:
  - alias: localnet
    rpc: "http://127.0.0.1:${SUI_RPC_PORT}"
    ws: ~
    basic_auth: ~
active_env: localnet
active_address: ~
YAML

    # Now generate a new address - this adds to keystore and updates active_address
    log_info "Generating new address..."
    sui client new-address ed25519 2>&1 | head -5 || true
  fi

  # Ensure we're on localnet environment
  sui client switch --env localnet 2>/dev/null || true

  # Request faucet funds
  log_info "Requesting faucet funds..."
  sleep 3  # Give faucet time to start
  local faucet_result=$(sui client faucet 2>&1) || true
  if echo "$faucet_result" | grep -q "successfully"; then
    log_success "Faucet funds received"
  else
    log_warn "Faucet request may have failed, retrying..."
    sleep 2
    sui client faucet 2>/dev/null || log_warn "Faucet retry failed (will try again later)"
  fi

  log_success "Sui localnet is running"
}

# === Database ===

setup_database() {
  log_section "Setting Up Database"

  cd "$BACKEND_DIR"

  # Remove old database for clean start
  if [[ -f "$DB_PATH" ]]; then
    log_info "Removing old database..."
    rm -f "$DB_PATH"
  fi

  # Generate Prisma client
  log_info "Generating Prisma client..."
  if ! npx prisma generate --schema=prisma/schema-v2.prisma; then
    log_error "Failed to generate Prisma client"
    return 1
  fi

  # Push schema
  log_info "Pushing database schema..."
  if ! npx prisma db push --schema=prisma/schema-v2.prisma --accept-data-loss; then
    log_error "Failed to push database schema"
    return 1
  fi

  log_success "Database ready: $DB_PATH"
}

# === Indexer ===

start_indexer() {
  log_section "Starting gRPC Indexer"

  # Check if already running
  local pid=$(get_pid "indexer")
  if is_running "$pid"; then
    log_warn "Indexer already running (PID: $pid), restarting..."
    stop_process "indexer"
  fi

  # Make sure port is free
  if is_port_in_use $INDEXER_METRICS_PORT; then
    log_warn "Port $INDEXER_METRICS_PORT in use, killing..."
    kill_port $INDEXER_METRICS_PORT
    sleep 1
  fi

  cd "$BACKEND_DIR"
  ensure_dirs

  # Load package IDs from .env if exists
  if [[ -f .env ]]; then
    log_info "Loading environment from .env..."
    set -a
    source .env 2>/dev/null || true
    set +a
  fi

  # Set/override required environment variables
  export SUI_GRPC_URL="http://127.0.0.1:$SUI_RPC_PORT"
  export SUI_RPC_URL="http://127.0.0.1:$SUI_RPC_PORT"
  export SUI_NETWORK="localnet"
  export METRICS_PORT="$INDEXER_METRICS_PORT"

  log_info "Starting indexer..."
  log_info "  gRPC URL: $SUI_GRPC_URL"
  log_info "  Metrics:  http://127.0.0.1:$INDEXER_METRICS_PORT"

  # Start indexer in background
  nohup npx tsx ./indexer-v2/grpc-indexer.ts > "$LOG_DIR/indexer-v2.log" 2>&1 &

  local indexer_pid=$!
  save_pid "indexer" "$indexer_pid"

  log_info "Indexer starting (PID: $indexer_pid)"
  log_info "Log: $LOG_DIR/indexer-v2.log"

  # Wait a moment and verify it's running
  sleep 3

  if is_running "$indexer_pid"; then
    log_success "Indexer is running"
  else
    log_error "Indexer failed to start"
    log_error "Last 30 lines of log:"
    tail -30 "$LOG_DIR/indexer-v2.log" || true
    return 1
  fi
}

# === API Server ===

start_api_server() {
  log_section "Starting API Server"

  # Check if already running
  local pid=$(get_pid "api-server")
  if is_running "$pid"; then
    log_warn "API server already running (PID: $pid), restarting..."
    stop_process "api-server"
  fi

  # Make sure port is free
  if is_port_in_use $API_SERVER_PORT; then
    log_warn "Port $API_SERVER_PORT in use, killing..."
    kill_port $API_SERVER_PORT
    sleep 1
  fi

  cd "$BACKEND_DIR"
  ensure_dirs

  # Set environment
  export API_PORT="$API_SERVER_PORT"

  log_info "Starting API server..."
  log_info "  API:     http://127.0.0.1:$API_SERVER_PORT"

  # Start API server in background
  nohup npx tsx ./indexer-v2/api-server.ts > "$LOG_DIR/api-server.log" 2>&1 &

  local api_pid=$!
  save_pid "api-server" "$api_pid"

  log_info "API server starting (PID: $api_pid)"
  log_info "Log: $LOG_DIR/api-server.log"

  # Wait a moment and verify it's running
  sleep 2

  if is_running "$api_pid"; then
    log_success "API server is running"
  else
    log_error "API server failed to start"
    log_error "Last 30 lines of log:"
    tail -30 "$LOG_DIR/api-server.log" || true
    return 1
  fi
}

# === Deploy Packages ===

deploy_packages() {
  log_section "Deploying Packages"

  cd "$PACKAGES_DIR"

  if [[ ! -f "deploy_verified.sh" ]]; then
    log_error "deploy_verified.sh not found in $PACKAGES_DIR"
    return 1
  fi

  log_info "Deploying packages to localnet..."
  ./deploy_verified.sh --network localnet

  log_success "Packages deployed"

  # Update backend .env
  update_backend_env
}

update_backend_env() {
  log_info "Updating backend .env with package IDs..."

  local all_packages="$PACKAGES_DIR/deployments-processed/_all-packages-localnet.json"

  if [[ ! -f "$all_packages" ]]; then
    log_warn "Package file not found: $all_packages"
    return 0
  fi

  cd "$BACKEND_DIR"

  # Extract package IDs
  local factory_pkg=$(node -p "require('$all_packages').futarchy_factory?.packageId || ''" 2>/dev/null)
  local markets_core_pkg=$(node -p "require('$all_packages').futarchy_markets_core?.packageId || ''" 2>/dev/null)
  local markets_ops_pkg=$(node -p "require('$all_packages').futarchy_markets_operations?.packageId || ''" 2>/dev/null)
  local markets_prim_pkg=$(node -p "require('$all_packages').futarchy_markets_primitives?.packageId || ''" 2>/dev/null)
  local governance_pkg=$(node -p "require('$all_packages').futarchy_governance?.packageId || ''" 2>/dev/null)
  local account_actions_pkg=$(node -p "require('$all_packages').account_actions?.packageId || ''" 2>/dev/null)

  # Create .env
  cat > .env << EOF
# Govex Localnet - Generated by localnet.sh at $(date)
NETWORK=localnet
SUI_RPC_URL=http://127.0.0.1:$SUI_RPC_PORT
SUI_GRPC_URL=http://127.0.0.1:$SUI_RPC_PORT
SUI_NETWORK=localnet

# Package IDs
V2_PACKAGE_ID=$factory_pkg
LAUNCHPAD_PACKAGE_ID=$factory_pkg
MARKETS_CORE_PACKAGE_ID=$markets_core_pkg
MARKETS_OPERATIONS_PACKAGE_ID=$markets_ops_pkg
MARKETS_PRIMITIVES_PACKAGE_ID=$markets_prim_pkg
GOVERNANCE_PACKAGE_ID=$governance_pkg
ACCOUNT_ACTIONS_PACKAGE_ID=$account_actions_pkg

# Indexer
METRICS_PORT=$INDEXER_METRICS_PORT
EOF

  log_success "Backend .env updated"
}

# === SDK Tests ===

# Track test results
TESTS_PASSED=0
TESTS_FAILED=0
declare -a FAILED_TEST_NAMES=()
declare -a FAILED_TEST_LOGS=()
TEST_LOGS_DIR="$LOG_DIR/tests"

# One-time protocol initialization (package registration, fee exemptions)
run_protocol_init() {
  log_section "Running Protocol Init (one-time)"
  cd "$SDK_DIR"
  npm run protocol-init
  log_success "Protocol init complete"
}

# Create fresh test coins for a new DAO
run_create_test_coins() {
  log_section "Creating Test Coins"
  cd "$SDK_DIR"
  npm run create-test-coins
  log_success "Test coins created"
}

# Create DAO via launchpad
run_launchpad_e2e() {
  log_section "Running Launchpad E2E"
  cd "$SDK_DIR"
  npm run launchpad-e2e-two-outcome
  log_success "Launchpad E2E complete"
}

# Create DAO directly (not via launchpad)
run_create_dao_direct() {
  log_section "Creating DAO Direct"
  cd "$SDK_DIR"
  npm run create-dao-direct
  log_success "DAO created"
}

# Deploy conditional coins for proposals
run_deploy_conditional_coins() {
  log_section "Deploying Conditional Coins"
  cd "$SDK_DIR"
  npm run deploy-conditional-coins
  log_success "Conditional coins deployed"
}

# Run a single test with fresh DAO setup
# Usage: run_test "test-name" "npm-script" [num_outcomes]
run_test() {
  local test_name="$1"
  local npm_script="$2"
  local num_outcomes="${3:-2}"  # Default to 2 outcomes
  local test_log="$TEST_LOGS_DIR/${test_name}.log"
  local setup_failed=false
  local test_failed=false

  log_section "TEST: $test_name"
  log_info "Log: $test_log"

  # Ensure test logs directory exists
  mkdir -p "$TEST_LOGS_DIR"

  # Start fresh log file with header
  {
    echo "================================================================================"
    echo "TEST: $test_name"
    echo "Started: $(date)"
    echo "Outcomes: $num_outcomes"
    echo "================================================================================"
    echo ""
  } > "$test_log"

  # Setup: fresh coins + DAO + conditional coins
  log_info "Setting up fresh DAO for test..."
  cd "$SDK_DIR"

  {
    echo "--- STEP: create-test-coins ---"
    if ! npm run create-test-coins 2>&1; then
      echo "❌ FAILED: create-test-coins"
      setup_failed=true
    else
      echo "✅ create-test-coins complete"
    fi
    echo ""
  } >> "$test_log" 2>&1

  if [[ "$setup_failed" == "true" ]]; then
    log_error "Failed to create test coins (see $test_log)"
    ((TESTS_FAILED++))
    FAILED_TEST_NAMES+=("$test_name")
    FAILED_TEST_LOGS+=("$test_log")
    return 1
  fi

  {
    echo "--- STEP: launchpad-e2e-two-outcome ---"
    if ! npm run launchpad-e2e-two-outcome 2>&1; then
      echo "❌ FAILED: launchpad-e2e-two-outcome"
      setup_failed=true
    else
      echo "✅ launchpad-e2e-two-outcome complete"
    fi
    echo ""
  } >> "$test_log" 2>&1

  if [[ "$setup_failed" == "true" ]]; then
    log_error "Failed to create DAO (see $test_log)"
    ((TESTS_FAILED++))
    FAILED_TEST_NAMES+=("$test_name")
    FAILED_TEST_LOGS+=("$test_log")
    return 1
  fi

  # Always generate conditional coins for the specified number of outcomes
  # This ensures we have the correct number (not leftover from a previous test)
  log_info "Generating $num_outcomes-outcome conditional coins..."
  {
    echo "--- STEP: generate-conditional-coins ($num_outcomes outcomes) ---"
    if ! npx tsx scripts/generate-conditional-coins.ts "$num_outcomes" 2>&1; then
      echo "❌ FAILED: generate-conditional-coins"
      setup_failed=true
    else
      echo "✅ generate-conditional-coins complete"
    fi
    echo ""
  } >> "$test_log" 2>&1

  if [[ "$setup_failed" == "true" ]]; then
    log_error "Failed to generate conditional coins (see $test_log)"
    ((TESTS_FAILED++))
    FAILED_TEST_NAMES+=("$test_name")
    FAILED_TEST_LOGS+=("$test_log")
    return 1
  fi

  # Calculate decimals spec: N coins with 9 decimals (asset) + N coins with 6 decimals (stable)
  # where N = num_outcomes
  local decimals_spec="9:${num_outcomes},6:${num_outcomes}"
  {
    echo "--- STEP: deploy-conditional-coins (${decimals_spec} for $num_outcomes outcomes) ---"
    if ! npx tsx scripts/deploy-conditional-coins.ts --decimals "$decimals_spec" 2>&1; then
      echo "❌ FAILED: deploy-conditional-coins"
      setup_failed=true
    else
      echo "✅ deploy-conditional-coins complete"
    fi
    echo ""
  } >> "$test_log" 2>&1

  if [[ "$setup_failed" == "true" ]]; then
    log_error "Failed to deploy conditional coins (see $test_log)"
    ((TESTS_FAILED++))
    FAILED_TEST_NAMES+=("$test_name")
    FAILED_TEST_LOGS+=("$test_log")
    return 1
  fi

  # Wait for indexer to catch up with new objects
  log_info "Waiting for indexer to sync (5s)..."
  sleep 5

  # Run the actual test
  log_info "Running test: $test_name"
  {
    echo "================================================================================"
    echo "RUNNING TEST: $npm_script"
    echo "================================================================================"
    echo ""
    if ! npm run "$npm_script" 2>&1; then
      echo ""
      echo "❌ TEST FAILED: $test_name"
      test_failed=true
    else
      echo ""
      echo "✅ TEST PASSED: $test_name"
    fi
    echo ""
    echo "Finished: $(date)"
  } >> "$test_log" 2>&1

  if [[ "$test_failed" == "true" ]]; then
    log_error "FAILED: $test_name"
    log_info "  └─ Log: $test_log"
    ((TESTS_FAILED++))
    FAILED_TEST_NAMES+=("$test_name")
    FAILED_TEST_LOGS+=("$test_log")
    return 1
  else
    log_success "PASSED: $test_name"
    ((TESTS_PASSED++))
    return 0
  fi
}

# Legacy: run protocol-setup (init + create coins)
run_protocol_setup() {
  log_section "Running Protocol Setup"
  cd "$SDK_DIR"
  npm run protocol-setup
  log_success "Protocol setup complete"
}

run_proposal_e2e() {
  log_section "Running Proposal E2E"
  cd "$SDK_DIR"
  npm run test:proposal-with-swaps
  log_success "Proposal E2E complete"
}

run_all_e2e() {
  # Reset test counters
  TESTS_PASSED=0
  TESTS_FAILED=0
  FAILED_TEST_NAMES=()
  FAILED_TEST_LOGS=()

  log_section "E2E TEST SUITE"
  log_info "Running all E2E tests with fresh DAO per test"
  log_info "Test logs: $TEST_LOGS_DIR/"

  # Clean stale test data files to prevent object ID mismatches
  log_info "Cleaning stale test data files..."
  rm -f "$SDK_DIR/test-dao-info.json" 2>/dev/null || true
  rm -f "$SDK_DIR/conditional-coins-info.json" 2>/dev/null || true
  rm -f "$SDK_DIR/test-coins-info.json" 2>/dev/null || true

  # Clean old test logs
  rm -rf "$TEST_LOGS_DIR" 2>/dev/null || true
  mkdir -p "$TEST_LOGS_DIR"

  # One-time protocol initialization
  run_protocol_init

  # Test 1: Proposal with swaps (uses launchpad DAO)
  run_test "proposal-with-swaps" "test:proposal-with-swaps" || true

  # Test 2: Reject wins
  run_test "reject-wins" "test:reject-wins" || true

  # Test 3: Memo action
  run_test "memo-action" "test:memo-action" || true

  # Test 4: Sponsorship
  run_test "sponsorship" "test:sponsorship" || true

  # Test 5: Multi-outcome (3 outcomes)
  run_test "multi-outcome" "test:multi-outcome" 3 || true

  # Summary
  log_section "TEST SUMMARY"
  echo ""
  echo -e "  ${GREEN}Passed:${NC}  ${TESTS_PASSED}"
  echo -e "  ${RED}Failed:${NC}  ${TESTS_FAILED}"
  echo ""

  if [ "$TESTS_FAILED" -gt 0 ]; then
    echo -e "${RED}┌─────────────────────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${RED}│ FAILED TESTS                                                                │${NC}"
    echo -e "${RED}├─────────────────────────────────────────────────────────────────────────────┤${NC}"
    for i in "${!FAILED_TEST_NAMES[@]}"; do
      local name="${FAILED_TEST_NAMES[$i]}"
      local log="${FAILED_TEST_LOGS[$i]}"
      echo -e "${RED}│${NC} ❌ ${YELLOW}${name}${NC}"
      echo -e "${RED}│${NC}    Log: ${CYAN}${log}${NC}"
      echo -e "${RED}│${NC}    Last 10 lines:"
      # Show last 10 lines of the log, indented
      tail -10 "$log" 2>/dev/null | while IFS= read -r line; do
        echo -e "${RED}│${NC}      ${line}"
      done
      echo -e "${RED}│${NC}"
    done
    echo -e "${RED}└─────────────────────────────────────────────────────────────────────────────┘${NC}"
    echo ""
    echo -e "${YELLOW}To view full logs:${NC}"
    for i in "${!FAILED_TEST_LOGS[@]}"; do
      echo -e "  cat ${FAILED_TEST_LOGS[$i]}"
    done
    echo ""
    log_error "E2E Test Suite FAILED"
  else
    log_success "All E2E tests passed!"
  fi
}

# === Status ===

show_status() {
  log_section "Status"

  echo "Processes:"

  local sui_pid=$(get_pid "sui-localnet")
  if is_running "$sui_pid"; then
    echo -e "  ${GREEN}●${NC} Sui Localnet (PID: $sui_pid)"
    echo "      RPC:     http://127.0.0.1:$SUI_RPC_PORT"
    echo "      Faucet:  http://127.0.0.1:$SUI_FAUCET_PORT"
    echo "      GraphQL: http://127.0.0.1:$SUI_GRAPHQL_PORT"
  else
    echo -e "  ${RED}○${NC} Sui Localnet (not running)"
  fi

  local indexer_pid=$(get_pid "indexer")
  if is_running "$indexer_pid"; then
    echo -e "  ${GREEN}●${NC} Indexer (PID: $indexer_pid)"
    echo "      Metrics: http://127.0.0.1:$INDEXER_METRICS_PORT/metrics"
    echo "      Health:  http://127.0.0.1:$INDEXER_METRICS_PORT/health"
  else
    echo -e "  ${RED}○${NC} Indexer (not running)"
  fi

  local api_pid=$(get_pid "api-server")
  if is_running "$api_pid"; then
    echo -e "  ${GREEN}●${NC} API Server (PID: $api_pid)"
    echo "      API:     http://127.0.0.1:$API_SERVER_PORT"
    echo "      Health:  http://127.0.0.1:$API_SERVER_PORT/health"
  else
    echo -e "  ${RED}○${NC} API Server (not running)"
  fi

  echo ""
  echo "Database:"
  if [[ -f "$DB_PATH" ]]; then
    local size=$(du -h "$DB_PATH" 2>/dev/null | cut -f1)
    echo -e "  ${GREEN}●${NC} $DB_PATH ($size)"
  else
    echo -e "  ${RED}○${NC} Database not found"
  fi

  echo ""
  echo "Logs:"
  echo "  tail -f $LOG_DIR/sui-localnet.log"
  echo "  tail -f $LOG_DIR/indexer-v2.log"
  echo "  tail -f $LOG_DIR/api-server.log"
}

# === Main ===

main() {
  local do_deploy=false
  local do_e2e=false
  local do_tests_only=false
  local do_stop=false
  local do_clean=false
  local do_restart=false
  local do_fresh=false
  local single_test=""

  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case $1 in
      --stop)
        do_stop=true
        shift
        ;;
      --clean)
        do_clean=true
        shift
        ;;
      --restart)
        do_restart=true
        shift
        ;;
      --fresh|--hard-reset|--nuke)
        do_fresh=true
        shift
        ;;
      --status)
        show_status
        exit 0
        ;;
      --deploy)
        do_deploy=true
        shift
        ;;
      --e2e)
        do_deploy=true
        do_e2e=true
        shift
        ;;
      --tests-only|--tests)
        do_tests_only=true
        shift
        ;;
      --test)
        do_tests_only=true
        single_test="$2"
        shift 2
        ;;
      --help|-h)
        cat << EOF
Govex Localnet Manager

Usage: $0 [options]

Options:
  (none)      Start localnet, database, and indexer
  --deploy    Also deploy packages after starting
  --e2e       Deploy and run all E2E tests (fresh DAO per test)
  --tests-only Run E2E tests only (skip deploy, assumes already deployed)
  --test NAME Run a single test by name (e.g., --test memo-action)
  --stop      Stop all processes
  --clean     Stop processes and clean logs/pids
  --restart   Soft restart (clean + start)
  --fresh     HARD RESET: nuke ~/.sui, db, deployments, .env - total fresh start
  --status    Show status of all processes
  --help      Show this help

Available tests for --test:
  proposal-with-swaps, reject-wins, memo-action, sponsorship, multi-outcome

E2E Test Flow (per test):
  1. create-test-coins        # Fresh TASSET/TSTABLE/LP coins
  2. launchpad-e2e            # Create DAO via launchpad
  3. deploy-conditional-coins # Deploy conditional coins
  4. run test                 # Run the actual test

Tests run by --e2e:
  - proposal-with-swaps (2 outcomes)
  - reject-wins (2 outcomes)
  - memo-action (2 outcomes)
  - sponsorship (2 outcomes)
  - multi-outcome (3 outcomes)

Logs:
  Service logs:  $LOG_DIR/
  Test logs:     $LOG_DIR/tests/<test-name>.log

  Each test captures full output (setup + test) to its own log file.
  Failed tests show last 10 lines and full log path in summary.

Examples:
  $0                        # Start everything
  $0 --deploy               # Start + deploy packages
  $0 --e2e                  # Start + deploy + run all E2E tests
  $0 --tests-only           # Re-run all E2E tests (no deploy)
  $0 --test memo-action     # Run single test (no deploy)
  $0 --test multi-outcome   # Run multi-outcome test
  $0 --restart --e2e        # Soft restart with E2E
  $0 --fresh --e2e          # HARD RESET then full E2E (recommended for clean slate)
  $0 --stop                 # Stop everything
EOF
        exit 0
        ;;
      *)
        log_error "Unknown option: $1"
        echo "Use --help for usage"
        exit 1
        ;;
    esac
  done

  # Handle stop/clean first
  if [[ "$do_stop" == true ]]; then
    stop_all
    # Disable cleanup trap since we already cleaned up
    CLEANUP_DONE=true
    exit 0
  fi

  if [[ "$do_clean" == true ]]; then
    stop_all
    clean_data
    CLEANUP_DONE=true
    exit 0
  fi

  # Handle --tests-only or --test (run tests without starting services)
  if [[ "$do_tests_only" == true ]]; then
    # Disable exit trap
    trap - EXIT

    # Verify localnet is running
    local sui_pid=$(get_pid "sui-localnet")
    if ! is_running "$sui_pid"; then
      log_error "Sui localnet is not running. Start it first with: ./localnet.sh --deploy"
      exit 1
    fi

    if [[ -n "$single_test" ]]; then
      # Run single test
      log_section "Running Single Test: $single_test"

      # Map test name to npm script and outcomes
      local npm_script=""
      local num_outcomes=2
      case "$single_test" in
        proposal-with-swaps)
          npm_script="test:proposal-with-swaps"
          ;;
        reject-wins)
          npm_script="test:reject-wins"
          ;;
        memo-action)
          npm_script="test:memo-action"
          ;;
        sponsorship)
          npm_script="test:sponsorship"
          ;;
        multi-outcome)
          npm_script="test:multi-outcome"
          num_outcomes=3
          ;;
        *)
          log_error "Unknown test: $single_test"
          echo "Available tests: proposal-with-swaps, reject-wins, memo-action, sponsorship, multi-outcome"
          exit 1
          ;;
      esac

      # Reset counters
      TESTS_PASSED=0
      TESTS_FAILED=0
      FAILED_TEST_NAMES=()
      FAILED_TEST_LOGS=()

      # Clean old test logs
      rm -rf "$TEST_LOGS_DIR" 2>/dev/null || true
      mkdir -p "$TEST_LOGS_DIR"

      # Run protocol init if needed
      run_protocol_init

      # Run the single test
      run_test "$single_test" "$npm_script" "$num_outcomes" || true

      # Show summary
      log_section "TEST RESULT"
      if [ "$TESTS_FAILED" -gt 0 ]; then
        echo -e "${RED}FAILED${NC}: $single_test"
        echo -e "Log: ${CYAN}${FAILED_TEST_LOGS[0]}${NC}"
        echo ""
        echo "Last 20 lines:"
        tail -20 "${FAILED_TEST_LOGS[0]}" 2>/dev/null
      else
        echo -e "${GREEN}PASSED${NC}: $single_test"
      fi
    else
      # Run all tests
      run_all_e2e
    fi
    exit 0
  fi

  if [[ "$do_fresh" == true ]]; then
    hard_reset
  elif [[ "$do_restart" == true ]]; then
    stop_all
    clean_data
  fi

  # Disable exit trap for normal operation (we want processes to keep running)
  trap - EXIT

  log_section "Govex Localnet"
  log_info "Starting at $(date)"

  # Start services
  start_sui_localnet
  setup_database

  # If deploying, deploy first, then start indexer with package IDs
  # Otherwise, start indexer now (requires existing .env with package IDs)
  if [[ "$do_deploy" == true ]]; then
    deploy_packages
    log_info "Starting indexer with fresh package IDs..."
    start_indexer
    start_api_server
  else
    # Only start indexer if we have package IDs
    if [[ -f "$BACKEND_DIR/.env" ]] && grep -q "V2_PACKAGE_ID=" "$BACKEND_DIR/.env" 2>/dev/null; then
      start_indexer
      start_api_server
    else
      log_warn "Skipping indexer start - no package IDs found in .env"
      log_warn "Run with --deploy to deploy packages first"
    fi
  fi

  # Run E2E if requested
  if [[ "$do_e2e" == true ]]; then
    run_all_e2e
  fi

  # Show final status
  show_status

  log_section "Ready!"
  echo ""
  echo "Commands:"
  echo "  $0 --status    # Check status"
  echo "  $0 --stop      # Stop all"
  echo "  $0 --restart   # Clean restart"
  echo ""
  echo "Logs:"
  echo "  tail -f $LOG_DIR/sui-localnet.log"
  echo "  tail -f $LOG_DIR/indexer-v2.log"
  echo "  tail -f $LOG_DIR/api-server.log"
}

main "$@"
