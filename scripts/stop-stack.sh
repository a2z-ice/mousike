#!/bin/bash
# =============================================================================
# stop-stack.sh — Stop the Mousike stack
#
# Two modes:
#   --clean    Full cleanup: delete Kind cluster, remove Docker images,
#              prune build cache, and optionally stop Docker Desktop & Ollama
#   (default)  Stop only: delete the Kind cluster, leave images and services
#
# Usage:
#   ./scripts/stop-stack.sh              # Delete Kind cluster only
#   ./scripts/stop-stack.sh --clean      # Full cleanup (images, caches, services)
#   ./scripts/stop-stack.sh --clean --yes # Full cleanup, non-interactive
#   ./scripts/stop-stack.sh --yes        # Non-interactive mode
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CLUSTER_NAME="mousike-cluster"
NAMESPACE="rag"

FULL_CLEAN=false
AUTO_YES=false

for arg in "$@"; do
  case "$arg" in
    --clean)  FULL_CLEAN=true ;;
    --yes|-y) AUTO_YES=true ;;
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
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()    { echo -e "${RED}[FAIL]${NC}  $*"; }
header()  { echo -e "\n${BOLD}═══ $* ═══${NC}\n"; }

confirm() {
  local prompt="$1"
  if [ "$AUTO_YES" = true ]; then
    return 0
  fi
  echo -n -e "    ${prompt} [y/N]: "
  read -r answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

# =============================================================================
# Show current state
# =============================================================================
header "Current State"

if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  success "Kind cluster '${CLUSTER_NAME}' is running"
  info "Pods in namespace '${NAMESPACE}':"
  kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null | while read -r line; do
    echo "        $line"
  done || true
  echo ""
else
  warn "Kind cluster '${CLUSTER_NAME}' is not running"
fi

if [ "$FULL_CLEAN" = true ]; then
  info "Mode: ${RED}Full cleanup${NC} (cluster + images + caches)"
else
  info "Mode: Stop Kind cluster only"
fi

# =============================================================================
# Phase 1: Delete Kind Cluster
# =============================================================================
header "Phase 1: Kind Cluster"

if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  if [ "$FULL_CLEAN" = false ] && [ "$AUTO_YES" = false ]; then
    if ! confirm "Delete Kind cluster '${CLUSTER_NAME}'?"; then
      info "Aborted."
      exit 0
    fi
  fi

  info "Deleting Kind cluster '${CLUSTER_NAME}'..."
  kind delete cluster --name "$CLUSTER_NAME"
  success "Kind cluster deleted"
else
  warn "Kind cluster '${CLUSTER_NAME}' does not exist — nothing to delete"
fi

# If not doing full cleanup, we're done
if [ "$FULL_CLEAN" = false ]; then
  header "Done"
  echo -e "  Kind cluster deleted. Docker images and build caches were kept."
  echo -e "  To restart: ${CYAN}./scripts/start-stack.sh --skip-build${NC}"
  echo ""
  exit 0
fi

# =============================================================================
# Phase 2: Remove Docker Images
# =============================================================================
header "Phase 2: Docker Images"

remove_image() {
  local image="$1"
  if docker image inspect "$image" &> /dev/null; then
    info "Removing image: $image"
    docker rmi "$image" 2>/dev/null && success "Removed $image" || warn "Could not remove $image (may be in use)"
  else
    warn "Image '$image' not found — skipping"
  fi
}

remove_image "mousike-app:latest"
remove_image "document-service:latest"

# Remove dangling images from buildpack builds
dangling=$(docker images -f "dangling=true" -q 2>/dev/null | wc -l | tr -d ' ')
if [ "$dangling" -gt 0 ]; then
  info "Removing $dangling dangling image(s)..."
  docker image prune -f > /dev/null 2>&1
  success "Dangling images removed"
fi

# =============================================================================
# Phase 3: Clean Build Caches
# =============================================================================
header "Phase 3: Build Caches"

if [ -d "$PROJECT_DIR/.gradle" ] || [ -d "$PROJECT_DIR/mousike/build" ] || [ -d "$PROJECT_DIR/document-service/build" ]; then
  if confirm "Clean Gradle build caches?"; then
    info "Running './gradlew clean'..."
    ./gradlew clean > /dev/null 2>&1 && success "Gradle build directories cleaned" || warn "Gradle clean failed"
  else
    info "Skipping Gradle clean"
  fi
else
  warn "No build directories found — skipping"
fi

# Clean Vaadin frontend caches
if [ -d "$PROJECT_DIR/mousike/node_modules" ]; then
  if confirm "Remove Vaadin node_modules cache?"; then
    rm -rf "$PROJECT_DIR/mousike/node_modules"
    success "Vaadin node_modules removed"
  else
    info "Skipping node_modules cleanup"
  fi
fi

# Clean e2e node_modules
if [ -d "$PROJECT_DIR/e2e/node_modules" ]; then
  if confirm "Remove e2e node_modules?"; then
    rm -rf "$PROJECT_DIR/e2e/node_modules"
    success "e2e node_modules removed"
  else
    info "Skipping e2e node_modules cleanup"
  fi
fi

# =============================================================================
# Phase 4: Docker Build Cache
# =============================================================================
header "Phase 4: Docker Build Cache"

if confirm "Prune Docker build cache (buildpack layers)?"; then
  info "Pruning Docker build cache..."
  docker builder prune -f > /dev/null 2>&1
  success "Docker build cache pruned"
else
  info "Skipping Docker build cache prune"
fi

# =============================================================================
# Phase 5: Stop Services (Optional)
# =============================================================================
header "Phase 5: Background Services"

# Ollama
if curl -sf --max-time 2 http://localhost:11434/api/tags > /dev/null 2>&1; then
  if confirm "Stop Ollama?"; then
    if [[ "$OSTYPE" == darwin* ]]; then
      # Quit the menu bar app first, then kill the server process
      osascript -e 'quit app "Ollama"' 2>/dev/null || true
      sleep 1
      pkill -f "Ollama" 2>/dev/null || true
      pkill -f "ollama" 2>/dev/null || true
    else
      pkill -f "ollama serve" 2>/dev/null || systemctl stop ollama 2>/dev/null || true
    fi
    # Verify stopped (give it a moment)
    sleep 3
    if curl -sf --max-time 2 http://localhost:11434/api/tags > /dev/null 2>&1; then
      warn "Ollama may still be running — try 'pkill ollama' manually"
    else
      success "Ollama stopped"
    fi
  else
    info "Keeping Ollama running"
  fi
else
  warn "Ollama is not running — skipping"
fi

# Docker Desktop
if docker info &> /dev/null; then
  if confirm "Stop Docker Desktop?"; then
    if [[ "$OSTYPE" == darwin* ]]; then
      osascript -e 'quit app "Docker Desktop"' 2>/dev/null || true
      osascript -e 'quit app "Docker"' 2>/dev/null || true
      # Give Docker Desktop time to shut down cleanly
      sleep 5
      # Force-kill if still hanging
      pkill -f "Docker Desktop" 2>/dev/null || true
    else
      systemctl stop docker 2>/dev/null || true
    fi
    sleep 2
    if docker info &>/dev/null 2>&1; then
      warn "Docker Desktop may still be shutting down"
    else
      success "Docker Desktop stopped"
    fi
  else
    info "Keeping Docker Desktop running"
  fi
else
  warn "Docker is not running — skipping"
fi

# =============================================================================
# Summary
# =============================================================================
header "Cleanup Complete"

echo -e "  ${GREEN}Removed:${NC}"
echo "    - Kind cluster '${CLUSTER_NAME}'"
echo "    - Docker images (mousike-app, document-service)"
echo "    - Build caches (as selected)"
echo ""
echo -e "  To start fresh: ${CYAN}./scripts/start-stack.sh${NC}"
echo ""
