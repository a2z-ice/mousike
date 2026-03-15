#!/bin/bash
# =============================================================================
# start-stack.sh — Start the entire Mousike stack from scratch
#
# Checks prerequisites (Docker Desktop, Ollama, kind, kubectl), creates the
# Kind cluster, deploys all infrastructure and applications, then runs a
# sanity-test suite to verify everything is working.
#
# Usage:
#   ./scripts/start-stack.sh              # Full start + sanity tests
#   ./scripts/start-stack.sh --skip-build # Reuse existing images
#   ./scripts/start-stack.sh --skip-tests # Skip sanity tests
#   ./scripts/start-stack.sh --yes        # Non-interactive (auto-accept prompts)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CLUSTER_NAME="mousike-cluster"
NAMESPACE="rag"

SKIP_BUILD=false
SKIP_TESTS=false
AUTO_YES=false

for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --skip-tests) SKIP_TESTS=true ;;
    --yes|-y)     AUTO_YES=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

# Auto-detect non-interactive terminals
if [ ! -t 0 ]; then
  AUTO_YES=true
fi

cd "$PROJECT_DIR"

# =============================================================================
# Colors & helpers
# =============================================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()    { echo -e "${RED}[FAIL]${NC}  $*"; }
header()  { echo -e "\n${BOLD}═══ $* ═══${NC}\n"; }

wait_for_url() {
  local url="$1"
  local label="$2"
  local timeout="${3:-120}"
  local interval=5
  local elapsed=0

  while [ $elapsed -lt $timeout ]; do
    if curl -sf --max-time 5 "$url" > /dev/null 2>&1; then
      return 0
    fi
    sleep $interval
    elapsed=$((elapsed + interval))
    printf "."
  done
  echo ""
  return 1
}

sanity_pass=0
sanity_fail=0
sanity_test() {
  local label="$1"
  shift
  if "$@" > /dev/null 2>&1; then
    success "$label"
    sanity_pass=$((sanity_pass + 1))
  else
    fail "$label"
    sanity_fail=$((sanity_fail + 1))
  fi
}

# =============================================================================
# Phase 1: Prerequisites
# =============================================================================
header "Phase 1: Checking Prerequisites"

# --- Docker Desktop ---
check_docker() {
  if ! command -v docker &> /dev/null; then
    fail "Docker CLI not found. Please install Docker Desktop."
    exit 1
  fi

  # Check if Docker is fully functional (not just process running but server responding)
  if docker info &> /dev/null && docker ps &> /dev/null; then
    success "Docker Desktop is running"
    return 0
  fi

  # Docker may be in a bad state (500 errors) — restart it
  if docker info 2>&1 | grep -q "500 Internal Server Error"; then
    warn "Docker Desktop is in a bad state (500 error). Restarting..."
    if [[ "$OSTYPE" == darwin* ]]; then
      osascript -e 'quit app "Docker"' 2>/dev/null || true
      sleep 5
      pkill -f "Docker Desktop" 2>/dev/null || true
      sleep 3
    fi
  else
    warn "Docker Desktop is not running."
  fi

  # Attempt to launch Docker Desktop on macOS
  if [[ "$OSTYPE" == darwin* ]]; then
    info "Attempting to launch Docker Desktop..."
    open -a "Docker" 2>/dev/null || true
  fi

  if [ "$AUTO_YES" = false ]; then
    echo -e "    Please start Docker Desktop and press ${BOLD}Enter${NC} to continue (or Ctrl+C to abort)..."
    read -r
  fi

  # Wait up to 120 seconds for Docker to become fully ready
  info "Waiting for Docker daemon to start..."
  local waited=0
  while ! docker info &> /dev/null || ! docker ps &> /dev/null; do
    if [ $waited -ge 120 ]; then
      fail "Docker daemon did not start within 120 seconds."
      exit 1
    fi
    sleep 3
    waited=$((waited + 3))
    printf "."
  done
  echo ""
  success "Docker Desktop is now running"
}
check_docker

# --- Ollama ---
check_ollama() {
  if ! command -v ollama &> /dev/null; then
    fail "Ollama CLI not found. Please install Ollama: https://ollama.ai"
    exit 1
  fi

  if curl -sf --max-time 3 http://localhost:11434/api/tags > /dev/null 2>&1; then
    success "Ollama is running at localhost:11434"
    return 0
  fi

  warn "Ollama is not running."

  # Attempt to launch Ollama on macOS
  if [[ "$OSTYPE" == darwin* ]]; then
    info "Attempting to launch Ollama..."
    open -a "Ollama" 2>/dev/null || true
  fi

  if [ "$AUTO_YES" = false ]; then
    echo -e "    Please start Ollama and press ${BOLD}Enter${NC} to continue (or Ctrl+C to abort)..."
    read -r
  fi

  info "Waiting for Ollama to start..."
  local waited=0
  while ! curl -sf --max-time 3 http://localhost:11434/api/tags > /dev/null 2>&1; do
    if [ $waited -ge 90 ]; then
      fail "Ollama did not start within 90 seconds."
      exit 1
    fi
    sleep 3
    waited=$((waited + 3))
    printf "."
  done
  echo ""
  success "Ollama is now running"
}
check_ollama

# --- Ollama models ---
check_ollama_model() {
  local model="$1"
  if ollama list 2>/dev/null | grep -q "$model"; then
    success "Ollama model '$model' is available"
  else
    warn "Ollama model '$model' not found. Pulling now..."
    ollama pull "$model"
    success "Ollama model '$model' pulled successfully"
  fi
}
check_ollama_model "llama3.2"
check_ollama_model "nomic-embed-text"

# --- kind ---
if command -v kind &> /dev/null; then
  success "kind is installed ($(kind version 2>/dev/null | head -1))"
else
  fail "kind is not installed. Install: https://kind.sigs.k8s.io/docs/user/quick-start/#installation"
  exit 1
fi

# --- kubectl ---
if command -v kubectl &> /dev/null; then
  success "kubectl is installed"
else
  fail "kubectl is not installed."
  exit 1
fi

# --- Java / Gradle ---
if [ -f "./gradlew" ]; then
  success "Gradle wrapper found"
else
  fail "Gradle wrapper (gradlew) not found in project root."
  exit 1
fi

# =============================================================================
# Phase 2: Kind Cluster
# =============================================================================
header "Phase 2: Kind Cluster Setup"

if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  if [ "$AUTO_YES" = true ]; then
    info "Kind cluster '${CLUSTER_NAME}' already exists — reusing (--yes mode)"
  else
    warn "Kind cluster '${CLUSTER_NAME}' already exists."
    echo -n "    Delete and recreate? [y/N]: "
    read -r answer
    if [[ "$answer" =~ ^[Yy]$ ]]; then
      info "Deleting existing cluster..."
      kind delete cluster --name "$CLUSTER_NAME"
      info "Creating Kind cluster..."
      kind create cluster --config k8s/kind-config.yaml
      success "Kind cluster created"
    else
      info "Reusing existing cluster"
    fi
  fi
else
  info "Creating Kind cluster..."
  kind create cluster --config k8s/kind-config.yaml
  success "Kind cluster created"
fi

# Ensure namespace exists
if kubectl get namespace "$NAMESPACE" &> /dev/null; then
  success "Namespace '$NAMESPACE' exists"
else
  info "Creating namespace '$NAMESPACE'..."
  kubectl create namespace "$NAMESPACE"
  success "Namespace '$NAMESPACE' created"
fi

kubectl config set-context --current --namespace="$NAMESPACE" > /dev/null
success "kubectl context set to namespace '$NAMESPACE'"

# =============================================================================
# Phase 3: Configuration
# =============================================================================
header "Phase 3: Applying Configuration"

kubectl apply -f k8s/configmap.yaml
success "ConfigMap 'rag-config' applied"

kubectl apply -f k8s/secrets.yaml
success "Secret 'rag-secrets' applied"

# =============================================================================
# Phase 4: Infrastructure Services
# =============================================================================
header "Phase 4: Deploying Infrastructure"

info "Deploying PostgreSQL..."
kubectl apply -f k8s/postgres/

info "Deploying Redis..."
kubectl apply -f k8s/redis/

info "Deploying Docling..."
kubectl apply -f k8s/docling/

info "Deploying Phoenix..."
kubectl apply -f k8s/phoenix/

info "Deploying Grafana LGTM..."
kubectl apply -f k8s/grafana/

echo ""
info "Waiting for infrastructure pods to be ready..."

info "  PostgreSQL (timeout: 300s — image pull on fresh cluster)..."
kubectl rollout status statefulset/postgres --timeout=300s
success "  PostgreSQL ready"

info "  Redis (timeout: 120s)..."
kubectl rollout status deployment/redis --timeout=120s
success "  Redis ready"

info "  Phoenix (timeout: 120s)..."
kubectl rollout status deployment/phoenix --timeout=120s
success "  Phoenix ready"

info "  Grafana LGTM (timeout: 120s)..."
kubectl rollout status deployment/grafana-lgtm --timeout=120s
success "  Grafana LGTM ready"

info "  Docling (timeout: 600s — first boot downloads ML models)..."
kubectl rollout status deployment/docling --timeout=600s
success "  Docling ready"

success "All infrastructure services are running"

# =============================================================================
# Phase 5: Build & Deploy Applications
# =============================================================================
header "Phase 5: Building & Deploying Applications"

if [ "$SKIP_BUILD" = false ]; then
  info "Building mousike-app image..."
  ./gradlew :mousike:bootBuildImage --imageName=mousike-app:latest -Pvaadin.productionMode=true
  success "mousike-app image built"

  info "Building document-service image..."
  ./gradlew :document-service:bootBuildImage --imageName=document-service:latest
  success "document-service image built"
else
  warn "Skipping image build (--skip-build)"
  # Verify images exist locally when skipping build
  if ! docker image inspect mousike-app:latest &>/dev/null; then
    fail "Image 'mousike-app:latest' not found locally. Run without --skip-build."
    exit 1
  fi
  if ! docker image inspect document-service:latest &>/dev/null; then
    fail "Image 'document-service:latest' not found locally. Run without --skip-build."
    exit 1
  fi
  success "Local images verified"
fi

info "Loading images into Kind cluster..."
kind load docker-image mousike-app:latest --name "$CLUSTER_NAME"
kind load docker-image document-service:latest --name "$CLUSTER_NAME"
success "Images loaded into Kind"

info "Deploying document-service..."
kubectl apply -f k8s/document-service/

info "Deploying mousike..."
kubectl apply -f k8s/mousike/

echo ""
info "Waiting for applications to be ready..."

info "  document-service (timeout: 180s)..."
kubectl rollout status deployment/document-service --timeout=180s
success "  document-service ready"

info "  mousike (timeout: 180s)..."
kubectl rollout status deployment/mousike --timeout=180s
success "  mousike ready"

success "All applications deployed"

# =============================================================================
# Phase 6: Sanity Tests
# =============================================================================
if [ "$SKIP_TESTS" = true ]; then
  header "Phase 6: Sanity Tests (SKIPPED)"
else
  header "Phase 6: Sanity Tests"

  info "Waiting for services to be fully accessible..."
  printf "  Mousike App "
  if wait_for_url "http://localhost:8080/actuator/health" "mousike" 90; then
    success "  Mousike App is accessible"
  else
    fail "  Mousike App not accessible at http://localhost:8080"
  fi

  printf "  Document Service "
  if wait_for_url "http://localhost:8091/actuator/health" "document-service" 90; then
    success "  Document Service is accessible"
  else
    fail "  Document Service not accessible at http://localhost:8091"
  fi

  echo ""
  info "Running sanity checks..."
  echo ""

  # --- Mousike health ---
  sanity_test "Mousike: actuator health is UP" \
    bash -c 'curl -sf http://localhost:8080/actuator/health | grep -q "\"status\":\"UP\""'

  sanity_test "Mousike: database component is UP" \
    bash -c 'curl -sf http://localhost:8080/actuator/health | grep -q "\"db\"" '

  sanity_test "Mousike: actuator info returns 200" \
    curl -sf http://localhost:8080/actuator/info

  sanity_test "Mousike: prometheus metrics available" \
    bash -c 'curl -sf http://localhost:8080/actuator/prometheus | grep -q "jvm_memory"'

  # --- Document Service health ---
  sanity_test "Document Service: actuator health is UP" \
    bash -c 'curl -sf http://localhost:8091/actuator/health | grep -q "\"status\":\"UP\""'

  # --- Ollama reachable from host ---
  sanity_test "Ollama: API responsive on localhost:11434" \
    curl -sf http://localhost:11434/api/tags

  sanity_test "Ollama: llama3.2 model loaded" \
    bash -c 'curl -sf http://localhost:11434/api/tags | grep -q "llama3.2"'

  sanity_test "Ollama: nomic-embed-text model loaded" \
    bash -c 'curl -sf http://localhost:11434/api/tags | grep -q "nomic-embed-text"'

  # --- Observability ---
  sanity_test "Phoenix: UI accessible at localhost:6006" \
    bash -c 'curl -sf -o /dev/null -w "%{http_code}" http://localhost:6006 | grep -q "200"'

  sanity_test "Grafana: UI accessible at localhost:3000" \
    bash -c 'curl -sf http://localhost:3000/api/health | grep -q "ok"'

  # --- Kubernetes pod status ---
  sanity_test "Kubernetes: all pods in Running state" \
    bash -c 'kubectl get pods -n rag --no-headers | grep -v Completed | awk "{print \$3}" | sort -u | grep -qv -e Error -e CrashLoopBackOff -e Pending'

  sanity_test "Kubernetes: all pods fully ready" \
    bash -c '! kubectl get pods -n rag --no-headers | grep -v Completed | grep -qv "1/1\|2/2"'

  # --- API smoke tests ---
  sanity_test "API: /api/search endpoint responds" \
    bash -c 'curl -sf "http://localhost:8080/api/search?q=test&topK=1" | grep -q "\["'

  sanity_test "API: /api/classify endpoint responds" \
    bash -c 'curl -sf -X POST http://localhost:8080/api/classify -H "Content-Type: application/json" -d "{\"description\":\"a large brass instrument\"}" | head -c 1 | grep -q .'

  sanity_test "API: /api/chat endpoint responds" \
    bash -c 'curl -sf -X POST http://localhost:8080/api/chat -H "Content-Type: application/json" -d "{\"message\":\"hello\"}" --max-time 60 | grep -q .'

  # --- Summary ---
  echo ""
  echo -e "${BOLD}━━━ Sanity Test Results ━━━${NC}"
  echo -e "  ${GREEN}Passed: ${sanity_pass}${NC}"
  if [ $sanity_fail -gt 0 ]; then
    echo -e "  ${RED}Failed: ${sanity_fail}${NC}"
  else
    echo -e "  ${RED}Failed: 0${NC}"
  fi
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
fi

# =============================================================================
# Summary
# =============================================================================
header "Stack is Ready!"

echo -e "  ${BOLD}Mousike App${NC}        http://localhost:8080"
echo -e "  ${BOLD}Document Service${NC}   http://localhost:8091"
echo -e "  ${BOLD}Phoenix (traces)${NC}   http://localhost:6006"
echo -e "  ${BOLD}Grafana (metrics)${NC}  http://localhost:3000"
echo -e "  ${BOLD}Ollama${NC}             http://localhost:11434"
echo ""

if [ $sanity_fail -gt 0 ] 2>/dev/null; then
  warn "Some sanity tests failed. Check the output above for details."
  echo "  Run 'kubectl get pods -n rag' and 'kubectl logs <pod> -n rag' to debug."
  exit 1
fi

echo -e "  Run ${CYAN}cd e2e && npx playwright test${NC} for full E2E tests."
echo ""
