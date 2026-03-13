#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

MODULE="${1:-mousike}"

if [ "$MODULE" == "mousike" ]; then
    echo "==> Rebuilding mousike-app..."
    ./gradlew :mousike:bootBuildImage --imageName=mousike-app:latest
    kind load docker-image mousike-app:latest --name mousike-cluster
    kubectl rollout restart deployment/mousike -n rag
    kubectl rollout status deployment/mousike -n rag
elif [ "$MODULE" == "document-service" ]; then
    echo "==> Rebuilding document-service..."
    ./gradlew :document-service:bootBuildImage --imageName=document-service:latest
    kind load docker-image document-service:latest --name mousike-cluster
    kubectl rollout restart deployment/document-service -n rag
    kubectl rollout status deployment/document-service -n rag
else
    echo "Usage: $0 [mousike|document-service]"
    exit 1
fi

echo "==> Redeploy complete!"
