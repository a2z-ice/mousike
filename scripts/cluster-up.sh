#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "==> Creating Kind cluster..."
kind create cluster --config k8s/kind-config.yaml

echo "==> Creating namespace..."
kubectl create namespace rag
kubectl config set-context --current --namespace=rag

echo "==> Applying ConfigMap and Secrets..."
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml

echo "==> Deploying infrastructure services..."
kubectl apply -f k8s/postgres/
kubectl apply -f k8s/redis/
kubectl apply -f k8s/docling/
kubectl apply -f k8s/phoenix/
kubectl apply -f k8s/grafana/

echo "==> Waiting for infrastructure to be ready..."
kubectl rollout status statefulset/postgres --timeout=120s
kubectl rollout status deployment/redis --timeout=60s
kubectl rollout status deployment/phoenix --timeout=60s
kubectl rollout status deployment/grafana-lgtm --timeout=60s
echo "  (Docling may take 2-5 min on first boot for ML model download)"
kubectl rollout status deployment/docling --timeout=300s

echo "==> Building and loading application images..."
./gradlew :mousike:bootBuildImage --imageName=mousike-app:latest
./gradlew :document-service:bootBuildImage --imageName=document-service:latest
kind load docker-image mousike-app:latest --name mousike-cluster
kind load docker-image document-service:latest --name mousike-cluster

echo "==> Deploying applications..."
kubectl apply -f k8s/document-service/
kubectl apply -f k8s/mousike/

echo "==> Waiting for applications..."
kubectl rollout status deployment/document-service --timeout=120s
kubectl rollout status deployment/mousike --timeout=120s

echo "==> Cluster ready!"
echo "   Mousike App:       http://localhost:8080"
echo "   Document Service:  http://localhost:8090"
echo "   Phoenix:           http://localhost:6006"
echo "   Grafana:           http://localhost:3000"
