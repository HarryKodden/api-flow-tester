#!/usr/bin/env bash
set -euo pipefail

# Generic load test runner for HTTP + Socket.IO
# Requires: ab, curl, python3

HOST="localhost"
PORT="8080"
SCHEME="http"
CONCURRENCY=50
REQUESTS=5000
WS_CONNECTIONS=50
WS_DURATION=10
TARGET_RPS=500
TARGET_USERS=100
OUTPUT_DIR="./results"
LABEL="baseline"
ENDPOINTS="/health,/config,/api/users/me"
GENERATE_REPORT=true
SCENARIO_FILE=""
SCENARIO_USERS=20
SCENARIO_DURATION=30
SCENARIO_ITERATIONS=0
SCENARIO_ENVIRONMENT=""
SCENARIO_STRICT=false
SCENARIO_ONLY=false
SECRETS_FILE=""

ORIGINAL_CMD=$(printf '%q ' "$0" "$@")
ORIGINAL_CMD="${ORIGINAL_CMD% }"

usage() {
  cat <<'EOF'
Usage: ./bin/loadtest.sh [options]

Options:
  --host <host>              target host (default: localhost)
  --port <port>              target port (default: 8080)
  --scheme <http|https>      target scheme (default: http)
  --concurrency <n>          HTTP concurrency (default: 50)
  --requests <n>             requests per endpoint (default: 5000)
  --websockets <n>           concurrent websocket clients (default: 50)
  --duration <seconds>       websocket test duration (default: 10)
  --target-rps <n>           target RPS goal (default: 500)
  --target-users <n>         target concurrent users goal (default: 100)
  --endpoints <csv>          comma-separated endpoints (default: /health,/config,/api/users/me)
  --label <name>             run label (default: baseline)
  --output-dir <path>        result root dir (default: ./results)
  --scenario-file <path>     JSON scenario file for chained API workflows
  --scenario-users <n>       virtual users for scenario execution (default: 20)
  --scenario-duration <sec>  scenario test duration (default: 30)
  --scenario-iterations <n>  max scenario loops per user, 0 = unlimited
  --scenario-environment <n> selected scenario environment name
  --scenario-strict          exit non-zero if scenario steps fail (compliance mode)
  --scenario-only            skip ApacheBench/WebSocket probes; do not fail if /health is missing
  --regression               one pass through the scenario/suite: 1 user, 1 iteration, strict, no report
  --secrets-file <path>      JSON/YAML or SOPS-encrypted secrets file for ${secret:name} references
  --no-report                skip markdown report + diagram generation
  -h, --help                 show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --scheme) SCHEME="$2"; shift 2 ;;
    --concurrency) CONCURRENCY="$2"; shift 2 ;;
    --requests) REQUESTS="$2"; shift 2 ;;
    --websockets) WS_CONNECTIONS="$2"; shift 2 ;;
    --duration) WS_DURATION="$2"; shift 2 ;;
    --target-rps) TARGET_RPS="$2"; shift 2 ;;
    --target-users) TARGET_USERS="$2"; shift 2 ;;
    --endpoints) ENDPOINTS="$2"; shift 2 ;;
    --label) LABEL="$2"; shift 2 ;;
    --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
    --scenario-file) SCENARIO_FILE="$2"; shift 2 ;;
    --scenario-users) SCENARIO_USERS="$2"; shift 2 ;;
    --scenario-duration) SCENARIO_DURATION="$2"; shift 2 ;;
    --scenario-iterations) SCENARIO_ITERATIONS="$2"; shift 2 ;;
    --scenario-environment) SCENARIO_ENVIRONMENT="$2"; shift 2 ;;
    --scenario-strict) SCENARIO_STRICT=true; shift 1 ;;
    --scenario-only) SCENARIO_ONLY=true; shift 1 ;;
    --regression)
      SCENARIO_ONLY=true
      SCENARIO_STRICT=true
      GENERATE_REPORT=false
      SCENARIO_USERS=1
      SCENARIO_ITERATIONS=1
      if [[ "$LABEL" == "baseline" ]]; then
        LABEL="regression"
      fi
      shift 1
      ;;
    --secrets-file) SECRETS_FILE="$2"; shift 2 ;;
    --no-report) GENERATE_REPORT=false; shift 1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1"; usage; exit 1 ;;
  esac
done

for cmd in ab curl python3; do
  command -v "$cmd" >/dev/null || { echo "Missing dependency: $cmd"; exit 1; }
done

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export PYTHONPATH="${ROOT_DIR}${PYTHONPATH:+:$PYTHONPATH}"

if [[ -n "${LTI_REWRITE_LOCALHOST:-}" ]]; then
  if [[ "$HOST" == "localhost" || "$HOST" == "127.0.0.1" || "$HOST" == "::1" ]]; then
    HOST="$LTI_REWRITE_LOCALHOST"
  fi
fi

BASE_URL="${SCHEME}://${HOST}:${PORT}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RUN_DIR="${OUTPUT_DIR}/${TIMESTAMP}_${LABEL}"
mkdir -p "$RUN_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'
log() { echo -e "${CYAN}[$(date +%H:%M:%S)]${RESET} $*"; }
ok() { echo -e "${GREEN}✔${RESET} $*"; }
warn() { echo -e "${YELLOW}!${RESET} $*"; }
err() { echo -e "${RED}x${RESET} $*"; }

log "Testing target ${BASE_URL}"
if curl -sf --connect-timeout 3 --max-time 5 "${BASE_URL}/health" >/dev/null; then
  ok "Target reachable"
else
  if [[ "$SCENARIO_ONLY" == "true" ]]; then
    warn "Cannot reach ${BASE_URL}/health; continuing in scenario-only mode"
  else
    err "Cannot reach ${BASE_URL}/health"
    exit 1
  fi
fi

IFS=',' read -r -a endpoint_arr <<< "$ENDPOINTS"

http_json_items=()
health_rps=0
health_p99=0
cu_rps=0
cu_p99=0

run_ab() {
  local endpoint="$1"
  local safe_name
  safe_name=$(echo "$endpoint" | sed 's#^/##; s#[^a-zA-Z0-9]#_#g')
  [[ -z "$safe_name" ]] && safe_name="root"

  local url="${BASE_URL}${endpoint}"
  local outfile="${RUN_DIR}/${safe_name}.txt"

  log "HTTP AB test ${endpoint}"
  ab -n "$REQUESTS" -c "$CONCURRENCY" -q -e "${RUN_DIR}/${safe_name}_percentiles.csv" "$url" > "$outfile" 2>&1 || true

  local rps p50 p99 failed
  rps=$(grep "Requests per second" "$outfile" | awk '{print $4}' || echo 0)
  p50=$(grep "Time per request" "$outfile" | head -1 | awk '{print $4}' || echo 0)
  p99=$(grep "99%" "$outfile" | awk '{print $2}' || echo 0)
  failed=$(grep "Failed requests" "$outfile" | awk '{print $3}' || echo 0)

  [[ "$endpoint" == "/health" ]] && health_rps="$rps" && health_p99="$p99"

  http_json_items+=("{\"endpoint\":\"$endpoint\",\"rps\":$rps,\"p50_ms\":$p50,\"p99_ms\":$p99,\"failed\":$failed}")

  if [[ "$failed" == "0" ]]; then
    ok "${endpoint}: ${rps} req/s (p99=${p99}ms)"
  else
    warn "${endpoint}: failed requests=${failed}"
  fi
}

ws_json="null"
if [[ "$SCENARIO_ONLY" != "true" ]]; then
  for endpoint in "${endpoint_arr[@]}"; do
    run_ab "$endpoint"
  done

  log "Concurrent-user AB test (${TARGET_USERS} users over /health)"
  ab -n "$REQUESTS" -c "$TARGET_USERS" -q -e "${RUN_DIR}/concurrent_users_percentiles.csv" "${BASE_URL}/health" > "${RUN_DIR}/concurrent_users.txt" 2>&1 || true
  cu_rps=$(grep "Requests per second" "${RUN_DIR}/concurrent_users.txt" | awk '{print $4}' || echo 0)
  cu_p99=$(grep "99%" "${RUN_DIR}/concurrent_users.txt" | awk '{print $2}' || echo 0)

  if python3 -c "import socketio" >/dev/null 2>&1; then
    log "WebSocket test (${WS_CONNECTIONS} clients for ${WS_DURATION}s)"
    python3 "$(dirname "$0")/../tools/ws_probe.py" \
      --target "$BASE_URL" \
      --connections "$WS_CONNECTIONS" \
      --duration "$WS_DURATION" \
      --output "${RUN_DIR}/websocket.json" >/dev/null 2>&1 || true

    if [[ -f "${RUN_DIR}/websocket.json" ]]; then
      ws_json=$(cat "${RUN_DIR}/websocket.json")
      ws_ok=$(python3 -c "import json; d=json.load(open('${RUN_DIR}/websocket.json')); print(d['connections_ok'])")
      ws_fail=$(python3 -c "import json; d=json.load(open('${RUN_DIR}/websocket.json')); print(d['connections_failed'])")
      ok "WS: ${ws_ok} ok / ${ws_fail} failed"
    fi
  else
    warn "python-socketio is not installed, skipping WebSocket probe"
  fi
else
  log "Scenario-only mode: skipping ApacheBench and WebSocket probes"
fi

scenario_json="null"
scenario_exit=0
if [[ -n "$SCENARIO_FILE" ]]; then
  if [[ ! -f "$SCENARIO_FILE" ]]; then
    err "Scenario file not found: $SCENARIO_FILE"
    exit 1
  fi

  if [[ "$SCENARIO_STRICT" == "true" && "$GENERATE_REPORT" == "false" ]]; then
    log "Regression run using ${SCENARIO_FILE}"
  else
    log "Scenario load test using ${SCENARIO_FILE}"
  fi
  set +e
  strict_args=()
  if [[ "$SCENARIO_STRICT" == "true" ]]; then
    strict_args+=(--fail-fast --strict)
  fi
  python3 "$(dirname "$0")/../tools/scenario_runner.py" \
    --scenario-file "$SCENARIO_FILE" \
    --base-url "$BASE_URL" \
    --users "$SCENARIO_USERS" \
    --duration "$SCENARIO_DURATION" \
    --iterations "$SCENARIO_ITERATIONS" \
    ${SCENARIO_ENVIRONMENT:+--environment "$SCENARIO_ENVIRONMENT"} \
    ${SECRETS_FILE:+--secrets-file "$SECRETS_FILE"} \
    "${strict_args[@]}" \
    --output "${RUN_DIR}/scenario.json"
  scenario_rc=$?
  set -e

  if [[ -f "${RUN_DIR}/scenario.json" ]]; then
    scenario_json=$(cat "${RUN_DIR}/scenario.json")
    scenario_rps=$(python3 -c "import json; d=json.load(open('${RUN_DIR}/scenario.json')); print(round(d['totals']['rps'], 2))")
    scenario_success=$(python3 -c "import json; d=json.load(open('${RUN_DIR}/scenario.json')); print(round(d['totals']['success_rate'] * 100, 2))")
    if [[ "$scenario_rc" -eq 0 ]]; then
      ok "Scenario test complete: ${scenario_rps} req/s, success=${scenario_success}%"
    else
      err "Scenario test failed: ${scenario_rps} req/s, success=${scenario_success}%"
      scenario_exit="$scenario_rc"
    fi
  else
    warn "Scenario output not generated"
    scenario_exit=1
  fi
fi

summary_file="${RUN_DIR}/summary.json"
command_json=${ORIGINAL_CMD//\\/\\\\}
command_json=${command_json//\"/\\\"}
{
  echo "{"
  echo "  \"timestamp\": \"${TIMESTAMP}\"," 
  echo "  \"label\": \"${LABEL}\"," 
  echo "  \"target\": \"${BASE_URL}\"," 
  echo "  \"command\": \"${command_json}\"," 
  echo "  \"targets\": {\"rps\": ${TARGET_RPS}, \"users\": ${TARGET_USERS}},"
  echo "  \"config\": {\"concurrency\": ${CONCURRENCY}, \"requests\": ${REQUESTS}, \"ws_connections\": ${WS_CONNECTIONS}, \"ws_duration\": ${WS_DURATION}},"
  echo "  \"headline\": {\"health_rps\": ${health_rps}, \"health_p99_ms\": ${health_p99}, \"concurrent_rps\": ${cu_rps}, \"concurrent_p99_ms\": ${cu_p99}},"
  echo "  \"http_tests\": [$( ((${#http_json_items[@]})) && { IFS=,; echo "${http_json_items[*]}"; } )],"
  echo "  \"websocket\": ${ws_json},"
  echo "  \"scenario\": ${scenario_json}"
  echo "}"
} > "$summary_file"

ok "Summary written: ${summary_file}"

if [[ "$GENERATE_REPORT" == "true" ]]; then
  if python3 -c "import matplotlib" >/dev/null 2>&1; then
    python3 "$(dirname "$0")/../tools/generate_report.py" --summary "$summary_file" --output-dir "$RUN_DIR"
    ok "Report generated at ${RUN_DIR}/report.md"
  else
    warn "matplotlib not installed, skipping diagrams/report"
    warn "Install dependencies: pip install -r requirements.txt"
  fi
else
  log "Skipping markdown report and diagrams"
fi

echo ""
echo "Run complete: ${RUN_DIR}"
if [[ "$SCENARIO_ONLY" == "true" ]]; then
  echo "Key metrics:"
  echo "- Scenario success: ${scenario_success:-n/a}%"
else
  echo "Key metrics:"
  echo "- /health RPS: ${health_rps}"
  echo "- /health p99: ${health_p99} ms"
  echo "- Concurrent RPS (${TARGET_USERS} users): ${cu_rps}"
fi

if [[ "$scenario_exit" -ne 0 && "$SCENARIO_STRICT" == "true" ]]; then
  exit "$scenario_exit"
fi
